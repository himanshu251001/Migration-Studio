import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Settings } from '@/features/migration/settings';
import { readSettings } from './settings';

/** Reports one line of live progress: `tool_call`, `tool_result` or `plan`. */
export type ProgressEvent = (type: string, message: string) => void;

/** Thrown for any failure of the CLI itself; messages never contain the prompt, the API key or the schema. */
export class ClaudeCliError extends Error { }

/** Thrown when the caller aborted the run; the runner records it as cancelled, not failed. */
export class ClaudeCliCancelledError extends Error {
	constructor() {
		super('The Claude run was stopped.');
	}
}

type NdjsonLine = Record<string, unknown>;

/** Everything a Claude call needs beyond its prompt. */
export interface ClaudeRunOptions {
	prompt: string;
	/** JSON schema the final answer must match. */
	jsonSchema: object;
	/** Absolute folder the exploring call is confined to. Synthesis calls ignore it. */
	cwd?: string;
	signal?: AbortSignal;
	onEvent?: ProgressEvent;
	/** Called once the child exists, so the run registry can kill it. */
	onProcessStart?: (kill: () => void) => void;
}

/** Where the Claude CLI usually lands when its folder is missing from the server's PATH (GUI launches, services). */
function commonInstallDirs(): string[] {
	const home = os.homedir();
	return [
		path.join(home, '.local', 'bin'),
		path.join(home, '.claude', 'local'),
		path.join(home, '.npm-global', 'bin'),
		path.join(home, '.volta', 'bin'),
		path.join(home, 'bin'),
		'/usr/local/bin',
		'/opt/homebrew/bin',
		'/usr/bin'
	];
}

/** Turns a bare command name into an absolute path: PATH first, then the common install folders. Anything else is returned as is. */
function resolveBareCommand(command: string): string {
	if (/[\\/]/.test(command)) {
		return command;
	}
	const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
	for (const dir of [...pathDirs, ...commonInstallDirs()]) {
		const candidate = path.join(dir, command);
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return command;
}

/**
 * On Windows a `claude.cmd` shim can only be spawned through a shell, whose quoting corrupts large `--json-schema`
 * arguments. Prefer a real `.exe` (a direct match, or the one the npm shim wraps) so arguments reach CreateProcess
 * literally; a shell is the last resort. Elsewhere the configured path is spawned directly.
 */
export function resolveClaudeExecutable(claudePath: string): { command: string; useShell: boolean } {
	if (process.platform !== 'win32') {
		return { command: resolveBareCommand(claudePath), useShell: false };
	}
	const isBare = !/[\\/]/.test(claudePath);
	try {
		const matches = isBare
			? execFileSync('where', [claudePath], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).map(line => line.trim()).filter(Boolean)
			: [claudePath];
		const exe = matches.find(match => /\.exe$/i.test(match));
		if (exe) {
			return { command: exe, useShell: false };
		}
		const cmd = matches.find(match => /\.cmd$/i.test(match));
		if (cmd) {
			const nested = path.join(path.dirname(cmd), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
			if (existsSync(nested)) {
				return { command: nested, useShell: false };
			}
		}
	} catch {
		// fall through to the shell shim
	}
	return { command: claudePath, useShell: true };
}

/** The child's environment: the server's own, minus Electron's node switch, plus the configured API key. */
function childEnv(settings: Settings): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	if (settings.apiKey) {
		env.ANTHROPIC_API_KEY = settings.apiKey;
	}
	return env;
}

/** Arguments shared by both modes. */
function commonArgs(settings: Settings, jsonSchema: object): string[] {
	const args = [
		'--json-schema', JSON.stringify(jsonSchema),
		// Headless: nobody can answer a permission prompt. The real boundary is the tool lists plus the cwd.
		'--permission-mode', 'dontAsk',
		'--max-budget-usd', String(settings.maxBudgetUsd)
	];
	if (settings.model) {
		args.push('--model', settings.model);
	}
	return args;
}

/** Read-only exploration of one folder, streaming progress. */
function exploringArgs(settings: Settings, jsonSchema: object): string[] {
	return [
		'--output-format', 'stream-json', '--include-partial-messages', '--verbose',
		...commonArgs(settings, jsonSchema),
		'--allowedTools', 'Read,Glob,Grep',
		'--disallowedTools', 'Write,Edit,Bash'
	];
}

/** Pure reasoning over data already in the prompt: no tools at all. */
function synthesisArgs(settings: Settings, jsonSchema: object): string[] {
	return ['--output-format', 'json', ...commonArgs(settings, jsonSchema), '--tools', ''];
}

/** Parses the CLI's `result` field, which is a JSON string or an already-parsed object. */
function parseResult(result: unknown): unknown {
	if (result === undefined) {
		throw new ClaudeCliError("The Claude CLI output had no 'result' field.");
	}
	if (typeof result === 'string') {
		try {
			return JSON.parse(result);
		} catch {
			throw new ClaudeCliError('The Claude CLI result was not valid JSON.');
		}
	}
	return result;
}

function summarizeToolUse(name: unknown, input: unknown): string {
	const text = JSON.stringify(input ?? {});
	return `${String(name)}(${text.length > 120 ? `${text.slice(0, 120)}…` : text})`;
}

/** Forwards the interesting parts of one stream-json line to `onEvent`. */
function reportLine(parsed: NdjsonLine, onEvent: ProgressEvent): void {
	const content = (parsed.message as { content?: Array<Record<string, unknown>> } | undefined)?.content ?? [];
	if (parsed.type === 'assistant') {
		for (const block of content) {
			if (block.type === 'tool_use') {
				onEvent('tool_call', summarizeToolUse(block.name, block.input));
			} else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
				onEvent('plan', block.text.trim().slice(0, 200));
			}
		}
	} else if (parsed.type === 'user') {
		const numFiles = (parsed.tool_use_result as { numFiles?: number; truncated?: boolean } | undefined)?.numFiles;
		if (numFiles !== undefined && content.some(block => block.type === 'tool_result')) {
			onEvent('tool_result', `→ ${numFiles} file(s) found`);
		}
	}
}

/** Spawns the CLI with the prompt on stdin (argv has a ~32K cap on Windows) and wires cancellation. */
function spawnClaude(settings: Settings, args: string[], prompt: string, cwd: string, options: ClaudeRunOptions): ChildProcess {
	const { command, useShell } = resolveClaudeExecutable(settings.claudePath);
	const child = spawn(command, ['-p', ...args], { cwd, env: childEnv(settings), stdio: ['pipe', 'pipe', 'pipe'], shell: useShell, windowsHide: true });
	options.onProcessStart?.(() => child.kill());
	// An early exit closes stdin; the 'close' handler reports the real reason.
	child.stdin?.on('error', () => undefined);
	child.stdin?.end(prompt);
	logClaude('INPUT', `cwd=${cwd}\n${prompt}`);
	return child;
}

/** Prints the raw CLI input/output to the server console (the terminal running Next.js). */
function logClaude(label: 'INPUT' | 'OUTPUT', text: string): void {
	console.log(`\n[claude-cli ${label}] ${new Date().toISOString()}\n${text}\n[/claude-cli ${label}]`);
}

/**
 * Explores the folder `cwd` read-only and returns the structured answer. Streams progress through `onEvent`.
 * Two timers: idle (reset on every output line, catches a real hang) and an absolute ceiling.
 */
export async function runClaude<T>(options: ClaudeRunOptions & { cwd: string }): Promise<T> {
	const settings = await readSettings();
	const idleMs = settings.idleTimeoutSec * 1000;
	const maxMs = settings.maxTimeoutSec * 1000;
	const finalLine = await new Promise<NdjsonLine>((resolve, reject) => {
		if (options.signal?.aborted) {
			reject(new ClaudeCliCancelledError());
			return;
		}
		const child = spawnClaude(settings, exploringArgs(settings, options.jsonSchema), options.prompt, options.cwd, options);
		let buffer = '';
		let stderr = '';
		let result: NdjsonLine | undefined;
		let settled = false;
		let idleTimer: NodeJS.Timeout | undefined;
		const maxTimer = setTimeout(() => stop(new ClaudeCliError(`The Claude CLI exceeded the maximum time of ${settings.maxTimeoutSec}s.`)), maxMs);
		const onAbort = () => stop(new ClaudeCliCancelledError());

		function stop(error: Error): void {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			child.kill();
			reject(error);
		}
		function cleanup(): void {
			clearTimeout(idleTimer);
			clearTimeout(maxTimer);
			options.signal?.removeEventListener('abort', onAbort);
		}
		function restartIdleTimer(): void {
			clearTimeout(idleTimer);
			idleTimer = setTimeout(() => stop(new ClaudeCliError(`The Claude CLI produced no output for ${settings.idleTimeoutSec}s; it is probably stuck.`)), idleMs);
		}

		restartIdleTimer();
		options.signal?.addEventListener('abort', onAbort, { once: true });

		child.stdout?.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			for (let index = buffer.indexOf('\n'); index !== -1; index = buffer.indexOf('\n')) {
				const line = buffer.slice(0, index).trim();
				buffer = buffer.slice(index + 1);
				if (!line) {
					continue;
				}
				let parsed: NdjsonLine;
				try {
					parsed = JSON.parse(line) as NdjsonLine;
				} catch {
					continue; // noise on stdout
				}
				restartIdleTimer();
				logClaude('OUTPUT', line);
				if (parsed.type === 'result') {
					result = parsed;
				} else if (options.onEvent) {
					reportLine(parsed, options.onEvent);
				}
			}
		});
		child.stderr?.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-500); });
		child.on('error', () => stop(new ClaudeCliError('Failed to start the Claude CLI. Check the path in Settings.')));
		child.on('close', code => {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			if (result) {
				resolve(result);
			} else if (code !== 0) {
				reject(new ClaudeCliError(`The Claude CLI exited with code ${code}: ${stderr || '(no stderr)'}`));
			} else {
				reject(new ClaudeCliError('The Claude CLI finished without a final result.'));
			}
		});
	});
	if (finalLine.is_error === true) {
		throw new ClaudeCliError('The Claude CLI reported an error for this request.');
	}
	return parseResult(finalLine.result) as T;
}

/** One blocking `--output-format json` call; resolves with stdout. */
function runBlocking(settings: Settings, prompt: string, options: ClaudeRunOptions, timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		if (options.signal?.aborted) {
			reject(new ClaudeCliCancelledError());
			return;
		}
		const child = spawnClaude(settings, synthesisArgs(settings, options.jsonSchema), prompt, options.cwd ?? process.cwd(), options);
		let stdout = '';
		let stderr = '';
		let settled = false;
		const timer = setTimeout(() => stop(new ClaudeCliError(`The Claude CLI timed out after ${Math.round(timeoutMs / 1000)}s.`)), timeoutMs);
		const onAbort = () => stop(new ClaudeCliCancelledError());

		function stop(error: Error): void {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', onAbort);
			child.kill();
			reject(error);
		}

		options.signal?.addEventListener('abort', onAbort, { once: true });
		child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
		child.stderr?.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-500); });
		child.on('error', () => stop(new ClaudeCliError('Failed to start the Claude CLI. Check the path in Settings.')));
		child.on('close', code => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', onAbort);
			if (code === 0) {
				logClaude('OUTPUT', stdout);
				resolve(stdout);
			} else {
				reject(new ClaudeCliError(`The Claude CLI exited with code ${code}: ${stderr || '(no stderr)'}`));
			}
		});
	});
}

function parseBlockingOutput(stdout: string): unknown {
	let outer: { result?: unknown; is_error?: unknown };
	try {
		outer = JSON.parse(stdout) as typeof outer;
	} catch {
		throw new ClaudeCliError('The Claude CLI did not return valid JSON.');
	}
	if (outer.is_error === true) {
		throw new ClaudeCliError('The Claude CLI reported an error for this request.');
	}
	return parseResult(outer.result);
}

/**
 * Reasons over JSON already placed in `prompt` and returns output matching `jsonSchema`; no tools, no file access.
 * Retries once with a corrective instruction when the answer is not valid JSON. The timeout is the settings' total.
 */
export async function runClaudeSynthesis<T>(options: ClaudeRunOptions): Promise<T> {
	const settings = await readSettings();
	const timeoutMs = settings.maxTimeoutSec * 1000;
	const corrective = `${options.prompt}\n\nIMPORTANT: Your previous response was not valid JSON matching the schema. Respond with ONLY the JSON object, no prose, no markdown code fences, no explanation.`;
	const stdout = await runBlocking(settings, options.prompt, options, timeoutMs);
	try {
		return parseBlockingOutput(stdout) as T;
	} catch (error) {
		if (error instanceof ClaudeCliError && /reported an error/.test(error.message)) {
			throw error;
		}
		return parseBlockingOutput(await runBlocking(settings, corrective, options, timeoutMs)) as T;
	}
}

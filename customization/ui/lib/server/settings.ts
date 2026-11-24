import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BACKEND_MODES, DEFAULT_SETTINGS, REDACTED_KEY, redactMongoUri, type BackendMode, type Settings } from '@/features/migration/settings';

/**
 * Settings live in a plain file next to the project store, never in MongoDB: the page that switches the backend
 * must keep working while Mongo is down. Defaults come from the environment, then from DEFAULT_SETTINGS.
 */
const DATA_ROOT = process.env.MIGRATION_STUDIO_DATA_DIR ? path.dirname(process.env.MIGRATION_STUDIO_DATA_DIR) : path.join(process.cwd(), '.data');
const SETTINGS_FILE = path.join(DATA_ROOT, 'settings.json');

/** Thrown for input the caller got wrong; the route turns these into 400 responses. */
export class SettingsError extends Error { }

function envDefaults(): Settings {
	return {
		...DEFAULT_SETTINGS,
		mongoUri: process.env.MONGODB_URI?.trim() || DEFAULT_SETTINGS.mongoUri,
		claudePath: process.env.CLAUDE_PATH?.trim() || DEFAULT_SETTINGS.claudePath
	};
}

function positiveNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Merges a stored (possibly hand-edited or partial) object over the defaults, ignoring invalid fields. */
function normalize(data: Record<string, unknown>, base: Settings): Settings {
	const mode = BACKEND_MODES.includes(data.backendMode as BackendMode) ? data.backendMode as BackendMode : base.backendMode;
	return {
		backendMode: mode,
		mongoUri: typeof data.mongoUri === 'string' && data.mongoUri.trim() ? data.mongoUri.trim() : base.mongoUri,
		claudePath: typeof data.claudePath === 'string' && data.claudePath.trim() ? data.claudePath.trim() : base.claudePath,
		model: typeof data.model === 'string' ? data.model.trim() : base.model,
		apiKey: typeof data.apiKey === 'string' ? data.apiKey.trim() : base.apiKey,
		maxBudgetUsd: positiveNumber(data.maxBudgetUsd) ?? base.maxBudgetUsd,
		idleTimeoutSec: positiveNumber(data.idleTimeoutSec) ?? base.idleTimeoutSec,
		maxTimeoutSec: positiveNumber(data.maxTimeoutSec) ?? base.maxTimeoutSec
	};
}

/** The stored settings with the real values (including the Mongo password). For server code only. */
export async function readSettings(): Promise<Settings> {
	const base = envDefaults();
	try {
		const data = JSON.parse(await readFile(SETTINGS_FILE, 'utf8')) as unknown;
		return typeof data === 'object' && data !== null ? normalize(data as Record<string, unknown>, base) : base;
	} catch {
		return base;
	}
}

/** The settings safe to send to the browser: the Mongo password is hidden. */
export function toPublic(settings: Settings): Settings {
	return { ...settings, mongoUri: redactMongoUri(settings.mongoUri), apiKey: settings.apiKey ? REDACTED_KEY : '' };
}

/** Rejects values that cannot work, with fixed messages that never echo the input. */
function validate(patch: Record<string, unknown>): void {
	if ('backendMode' in patch && !BACKEND_MODES.includes(patch.backendMode as BackendMode)) {
		throw new SettingsError('Backend must be "mock" or "real".');
	}
	if ('mongoUri' in patch && (typeof patch.mongoUri !== 'string' || !/^mongodb(\+srv)?:\/\/\S+$/i.test(patch.mongoUri.trim()))) {
		throw new SettingsError('The MongoDB URI must start with mongodb:// or mongodb+srv://.');
	}
	// eslint-disable-next-line no-control-regex
	if ('claudePath' in patch && (typeof patch.claudePath !== 'string' || !patch.claudePath.trim() || /[\u0000-\u001f]/.test(patch.claudePath))) {
		throw new SettingsError('The Claude path must be a command name or a file path.');
	}
	for (const key of ['model', 'apiKey'] as const) {
		// eslint-disable-next-line no-control-regex
		if (key in patch && (typeof patch[key] !== 'string' || /[\u0000-\u001f\s]/.test((patch[key] as string).trim()))) {
			throw new SettingsError('The model and API key must be single-line text without spaces.');
		}
	}
	for (const key of ['maxBudgetUsd', 'idleTimeoutSec', 'maxTimeoutSec'] as const) {
		if (key in patch && positiveNumber(patch[key]) === undefined) {
			throw new SettingsError('Budget and timeouts must be positive numbers.');
		}
	}
}

/**
 * Applies a partial update and returns the new settings. A `mongoUri` that equals the redacted form of the stored
 * one means "unchanged" (the browser never sees the real password and sends the redacted text back).
 */
export async function updateSettings(patch: Record<string, unknown>): Promise<Settings> {
	const current = await readSettings();
	const next = { ...patch };
	if (typeof next.mongoUri === 'string' && next.mongoUri.trim() === redactMongoUri(current.mongoUri) && redactMongoUri(current.mongoUri) !== current.mongoUri) {
		delete next.mongoUri;
	}
	if (next.apiKey === REDACTED_KEY) {
		delete next.apiKey;
	}
	validate(next);
	const merged = normalize(next, current);
	if (merged.idleTimeoutSec > merged.maxTimeoutSec) {
		throw new SettingsError('The idle timeout cannot exceed the total timeout.');
	}
	await mkdir(DATA_ROOT, { recursive: true });
	const tmp = `${SETTINGS_FILE}.tmp`;
	await writeFile(tmp, JSON.stringify(merged, null, '\t') + '\n', { mode: 0o600 });
	await rename(tmp, SETTINGS_FILE);
	return merged;
}

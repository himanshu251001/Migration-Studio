import { execFile } from 'node:child_process';
import mongoose from 'mongoose';
import type { CheckStatus, SettingsCheck } from '@/features/migration/settings';
import { readSettings } from './settings';
import { resolveClaudeExecutable } from './claudeCli';

const MONGO_TIMEOUT_MS = 3000;
const CLAUDE_TIMEOUT_MS = 5000;

/** Connects with a throwaway connection (the app has no pooled one yet) and reports a fixed message either way. */
async function checkMongo(uri: string): Promise<CheckStatus> {
	const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: MONGO_TIMEOUT_MS, connectTimeoutMS: MONGO_TIMEOUT_MS });
	try {
		await connection.asPromise();
		await connection.db?.admin().ping();
		return { ok: true, detail: 'MongoDB is reachable.' };
	} catch {
		return { ok: false, detail: 'MongoDB is unreachable. Check that it is running and the URI is correct.' };
	} finally {
		await connection.close().catch(() => undefined);
	}
}

/** Runs `<claudePath> --version` resolving a bare name on PATH and the common install folders. */
function checkClaude(claudePath: string): Promise<CheckStatus> {
	return new Promise(resolve => {
		const { command, useShell } = resolveClaudeExecutable(claudePath);
		execFile(command, ['--version'], { timeout: CLAUDE_TIMEOUT_MS, windowsHide: true, shell: useShell }, (error, stdout) => {
			if (error) {
				resolve({ ok: false, detail: 'The Claude CLI was not found or did not start. Set its full path.' });
			} else {
				resolve({ ok: true, detail: `Claude CLI found (${stdout.trim().slice(0, 80)}).` });
			}
		});
	});
}

/** Probes the two dependencies of the real backend using the stored settings. */
export async function checkBackend(): Promise<SettingsCheck> {
	const settings = await readSettings();
	const [mongo, claude] = await Promise.all([checkMongo(settings.mongoUri), checkClaude(settings.claudePath)]);
	return { mongo, claude };
}

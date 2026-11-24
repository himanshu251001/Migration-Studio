import { readSettings } from './settings';

/** Whether the Settings page selected the real (Claude CLI + MongoDB) backend. */
export async function isRealBackendEnabled(): Promise<boolean> {
	return (await readSettings()).backendMode === 'real';
}

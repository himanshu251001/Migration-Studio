import { BACKEND_MODES, type BackendMode } from '@/features/migration/settings';

const KEY = 'migration-studio.backendMode';

/**
 * The backend mode as the browser knows it. The server's settings file is the source of truth; this is its copy in
 * localStorage so every service call can read it synchronously. The sidebar and editor tabs are separate frames of
 * the same origin: a change in one reaches the others through the `storage` event.
 */
let current: BackendMode = 'mock';
const listeners = new Set<() => void>();

function isMode(value: unknown): value is BackendMode {
	return BACKEND_MODES.includes(value as BackendMode);
}

function load(): void {
	try {
		const stored = localStorage.getItem(KEY);
		if (isMode(stored)) {
			current = stored;
		}
	} catch {
		// storage blocked: keep the in-memory value
	}
}

if (typeof window !== 'undefined') {
	load();
	window.addEventListener('storage', e => {
		if (e.key === KEY && isMode(e.newValue) && e.newValue !== current) {
			current = e.newValue;
			listeners.forEach(l => l());
		}
	});
}

export function getBackendMode(): BackendMode {
	return current;
}

/** Records `mode` (also for the other frames) and notifies subscribers. */
export function setBackendMode(mode: BackendMode): void {
	if (mode === current) {
		return;
	}
	current = mode;
	try {
		localStorage.setItem(KEY, mode);
	} catch {
		// other frames then pick it up from the server settings on their next load
	}
	listeners.forEach(l => l());
}

export function subscribeBackendMode(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

const KEY = 'migration-studio-intent';

/**
 * A one-shot request from the sidebar to the studio tab ("show the create form"). It travels through
 * sessionStorage because the two live in separate frames of the same origin: an already open studio tab hears
 * about it through the `storage` event, a tab opened afterwards reads it when it mounts.
 */
export function requestCreateProject(): void {
	try {
		sessionStorage.setItem(KEY, 'create');
	} catch {
		// the studio then simply opens on its default view
	}
}

/** Returns true (once) if the sidebar asked for the create form. */
export function consumeCreateProjectRequest(): boolean {
	try {
		const requested = sessionStorage.getItem(KEY) === 'create';
		sessionStorage.removeItem(KEY);
		return requested;
	} catch {
		return false;
	}
}

/** Calls `onRequest` when the sidebar asks, while the studio tab is already open. Returns an unsubscribe function. */
export function onCreateProjectRequest(onRequest: () => void): () => void {
	const listener = (e: StorageEvent) => {
		if (e.key === KEY && e.newValue === 'create' && consumeCreateProjectRequest()) {
			onRequest();
		}
	};
	window.addEventListener('storage', listener);
	return () => window.removeEventListener('storage', listener);
}

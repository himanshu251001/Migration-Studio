/**
 * Lets concurrent callers for the same not-yet-generated resource share one in-flight generation instead of each
 * paying for their own (React dev double-invoke, a refresh mid-generation, two frames). Safe because the app runs as
 * a single Node process.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function withGenerationLock<T>(key: string, run: () => Promise<T>): Promise<T> {
	const existing = inFlight.get(key);
	if (existing) {
		return existing as Promise<T>;
	}
	const promise = run().finally(() => inFlight.delete(key));
	inFlight.set(key, promise);
	return promise;
}

/** Mongo duplicate-key error code; defence in depth if the lock is ever bypassed. */
export function isDuplicateKeyError(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 11000;
}

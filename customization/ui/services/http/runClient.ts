import type { RunDoneEvent, RunEvent } from '@/features/migration/runs';

/** A run that ended anywhere but `completed`; the message is the last error event, or fixed text. */
export class RunFailedError extends Error { }

/** Thrown when the caller aborted; callers treat it as a normal stop, not a failure. */
export class RunStoppedError extends Error {
	constructor() {
		super('The run was stopped.');
	}
}

async function readError(response: Response): Promise<string> {
	const data = await response.json().catch(() => ({})) as { error?: string };
	return data.error ?? `Request failed (${response.status}).`;
}

/** Starts a run with `POST startUrl` and returns its id. */
async function postStart(startUrl: string, body: unknown): Promise<string> {
	const response = await fetch(startUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
	const data = await response.json().catch(() => ({})) as { runId?: string; error?: string };
	if (!response.ok || !data.runId) {
		throw new Error(data.error ?? `Request failed (${response.status}).`);
	}
	return data.runId;
}

interface PendingStart {
	readonly promise: Promise<string>;
	holders: number;
}

/**
 * Starts still waiting for their run id, shared by identical requests. React strict mode mounts, aborts and remounts an
 * effect at once; without sharing, the aborted first POST leaves an orphan run and the second POST gets a 409.
 */
const pendingStarts = new Map<string, PendingStart>();

/** Joins (or begins) the start for this request; the returned `release` drops this caller's interest. */
function startRun(startUrl: string, body: unknown): { promise: Promise<string>; release: () => void } {
	const key = `${startUrl}\n${JSON.stringify(body)}`;
	let entry = pendingStarts.get(key);
	if (!entry) {
		const created: PendingStart = { promise: postStart(startUrl, body), holders: 0 };
		const clear = () => { pendingStarts.delete(key); };
		created.promise.then(clear, clear);
		pendingStarts.set(key, created);
		entry = created;
	}
	const shared = entry;
	shared.holders++;
	let released = false;
	return {
		promise: shared.promise,
		release: () => {
			if (!released) {
				released = true;
				shared.holders--;
				// Nobody wants the run any more: once its id is known, kill it.
				if (shared.holders === 0) {
					shared.promise.then(id => cancelRun(id), () => undefined);
				}
			}
		}
	};
}

/** Tells the server to kill the run; failures are ignored because the run may have just finished. */
async function cancelRun(runId: string): Promise<void> {
	await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }).catch(() => undefined);
}

/**
 * Starts a run on the server and follows its event stream until it ends.
 * `onProgress` receives 0..1 whenever an event reports progress. Aborting `signal` stops the run on the server
 * (killing the CLI process) and rejects with {@link RunStoppedError}. Resolves with the run id when it completes.
 */
export async function runStep(startUrl: string, body: unknown, onProgress: (fraction: number) => void, signal?: AbortSignal, onLog?: (line: string) => void): Promise<string> {
	if (signal?.aborted) {
		throw new RunStoppedError();
	}
	const start = startRun(startUrl, body);
	const onEarlyAbort = () => start.release();
	signal?.addEventListener('abort', onEarlyAbort, { once: true });
	let runId: string;
	try {
		runId = await start.promise;
	} catch (e) {
		signal?.removeEventListener('abort', onEarlyAbort);
		throw signal?.aborted ? new RunStoppedError() : e;
	}
	signal?.removeEventListener('abort', onEarlyAbort);
	if (signal?.aborted) {
		throw new RunStoppedError();
	}
	return new Promise<string>((resolve, reject) => {
		const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`);
		let lastError = '';
		let ended = false;
		const end = (action: () => void) => {
			if (ended) {
				return;
			}
			ended = true;
			source.close();
			signal?.removeEventListener('abort', onAbort);
			action();
		};
		const onAbort = () => {
			void cancelRun(runId);
			end(() => reject(new RunStoppedError()));
		};
		signal?.addEventListener('abort', onAbort, { once: true });

		source.onmessage = message => {
			const data = JSON.parse(message.data as string) as RunEvent | RunDoneEvent;
			if (data.type === 'done') {
				const status = (data as RunDoneEvent).status;
				end(() => {
					if (status === 'completed') {
						onProgress(1);
						resolve(runId);
					} else if (status === 'cancelled') {
						reject(new RunStoppedError());
					} else {
						reject(new RunFailedError(lastError || 'The run failed.'));
					}
				});
				return;
			}
			const event = data as RunEvent;
			if (event.message) {
				onLog?.(event.message);
			}
			if (event.type === 'error') {
				lastError = event.message;
			}
			if (event.progress !== undefined) {
				onProgress(Math.max(0, Math.min(1, event.progress)));
			}
		};
		// EventSource retries on its own, replaying the stored log; only a closed source is a real failure.
		source.onerror = () => {
			if (source.readyState === EventSource.CLOSED) {
				end(() => reject(new RunFailedError('Lost the connection to the run.')));
			}
		};
	});
}

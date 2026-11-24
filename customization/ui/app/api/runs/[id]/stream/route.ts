import type { RunDoneEvent, RunEvent, RunStatus } from '@/features/migration/runs';
import { connectDB } from '@/lib/server/db';
import { Run, type RunEventDoc } from '@/lib/server/models/Run';
import { runEventBus } from '@/lib/server/runEvents';
import { guardRunRequest, runRouteError } from '@/lib/server/runRoute';

export const dynamic = 'force-dynamic';

function toEvent(event: RunEventDoc): RunEvent {
	return { type: event.type, message: event.message, timestamp: event.timestamp.toISOString(), ...(event.progress === undefined ? {} : { progress: event.progress }) };
}

function eventKey(event: RunEvent): string {
	return `${event.timestamp}|${event.type}|${event.message}`;
}

/**
 * Server-sent events for one run: every stored event is replayed first, then live ones follow, and a final
 * `{type:'done',status}` message ends the stream.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	const { id } = await params;
	const rejected = guardRunRequest(request, id);
	if (rejected) {
		return rejected;
	}
	try {
		await connectDB();
		const encoder = new TextEncoder();
		let closed = false;
		let onEvent: ((event: RunEvent) => void) | undefined;
		let onDone: (() => void) | undefined;
		const detach = () => {
			closed = true;
			if (onEvent) {
				runEventBus.off(id, onEvent);
			}
			if (onDone) {
				runEventBus.off(`${id}:done`, onDone);
			}
		};

		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				const send = (data: RunEvent | RunDoneEvent) => {
					if (!closed) {
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
					}
				};
				const end = (status: RunStatus) => {
					send({ type: 'done', status });
					detach();
					controller.close();
				};

				// Subscribe before reading the stored log so no event falls in the gap; duplicates are dropped by key.
				const replayed = new Set<string>();
				let replaying = true;
				const queued: RunEvent[] = [];
				onEvent = event => {
					if (replaying) {
						queued.push(event);
					} else {
						send(event);
					}
				};
				onDone = () => {
					void Run.findById(id).lean().then(finished => end(finished?.status ?? 'failed'), () => end('failed'));
				};
				runEventBus.on(id, onEvent);
				runEventBus.on(`${id}:done`, onDone);

				const run = await Run.findById(id).lean();
				if (!run) {
					detach();
					controller.error(new Error('Run not found.'));
					return;
				}
				for (const doc of run.events) {
					const event = toEvent(doc);
					replayed.add(eventKey(event));
					send(event);
				}
				replaying = false;
				for (const event of queued) {
					if (!replayed.has(eventKey(event))) {
						send(event);
					}
				}
				if (run.status !== 'running') {
					end(run.status);
				}
			},
			cancel() {
				detach();
			}
		});

		return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
	} catch (error) {
		return runRouteError(error);
	}
}

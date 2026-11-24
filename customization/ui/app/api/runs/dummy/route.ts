import { runClaudeSynthesis } from '@/lib/server/claudeCli';
import { startRun } from '@/lib/server/runner';
import { guardRunRequest, runRouteError } from '@/lib/server/runRoute';

export const dynamic = 'force-dynamic';

const STEPS = 5;
const STEP_MS = 1000;

/** Waits, but resolves early when the run is stopped. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise(resolve => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
	});
}

const PING_SCHEMA = { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply: { type: 'string' } } };

/**
 * Starts a no-op run that logs a few progress events. Exists to exercise the run, stream and stop plumbing.
 * With `claude: true` the run instead makes one tiny synthesis call, to prove the CLI path, timeouts and Stop.
 */
export async function POST(request: Request): Promise<Response> {
	const rejected = guardRunRequest(request);
	if (rejected) {
		return rejected;
	}
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; claude?: unknown } | undefined;
	if (typeof body?.projectId !== 'string' || !body.projectId.trim()) {
		return Response.json({ error: 'A projectId is required.' }, { status: 400 });
	}
	try {
		const runId = await startRun({
			phase: 'dummy',
			projectId: body.projectId,
			exec: async ({ signal, log, onProcessStart }) => {
				if (body.claude === true) {
					await log('progress', 'Calling the Claude CLI', 0.1);
					const answer = await runClaudeSynthesis<{ reply: string }>({ prompt: 'Reply with the single word pong.', jsonSchema: PING_SCHEMA, signal, onProcessStart });
					await log('plan', `Claude answered: ${String(answer.reply).slice(0, 80)}`, 1);
					return;
				}
				for (let step = 1; step <= STEPS && !signal.aborted; step++) {
					await pause(STEP_MS, signal);
					if (!signal.aborted) {
						await log('progress', `Step ${step} of ${STEPS}`, step / STEPS);
					}
				}
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

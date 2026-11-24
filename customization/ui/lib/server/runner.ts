import type { RunEvent, RunStatus } from '@/features/migration/runs';
import { attachKill, registerRun, unregisterRun } from './activeRuns';
import { ClaudeCliCancelledError, ClaudeCliError } from './claudeCli';
import { connectDB, DatabaseUnavailableError } from './db';
import { Run } from './models/Run';
import { runEventBus } from './runEvents';
import { WorkspacePathError } from './projectWorkspace';
import { StepPrerequisiteError } from './stepErrors';

/** What an executor gets: its run id, an abort signal, and helpers that log to the run. */
export interface RunContext {
	runId: string;
	signal: AbortSignal;
	/** Appends an event to the run log and streams it. `progress` is a fraction 0..1. */
	log(type: string, message: string, progress?: number): Promise<void>;
	/** Pass to the Claude runner as `onProcessStart` so Stop kills the process. */
	onProcessStart(kill: () => void): void;
}

/** Appends one event to the stored run and to every open stream. */
export async function appendEvent(runId: string, type: string, message: string, progress?: number): Promise<void> {
	const event: RunEvent = { type, message, timestamp: new Date().toISOString(), ...(progress === undefined ? {} : { progress }) };
	await Run.updateOne({ _id: runId }, { $push: { events: { ...event, timestamp: new Date(event.timestamp) } } });
	runEventBus.emitRunEvent(runId, event);
}

async function finish(runId: string, status: RunStatus): Promise<void> {
	await Run.updateOne({ _id: runId, status: 'running' }, { $set: { status, completedAt: new Date() } });
	unregisterRun(runId);
	runEventBus.emitRunDone(runId);
}

/** Closes a run no process in this server tracks any more (it restarted), so it cannot stay `running` forever. */
export async function markCancelled(runId: string): Promise<void> {
	await appendEvent(runId, 'plan', 'Stopped by user.');
	await finish(runId, 'cancelled');
}

/**
 * Creates a run, starts `exec` in the background and returns the run id immediately (the route answers 202).
 * The outcome is recorded on the run: `completed`, `cancelled` (Stop) or `failed` with a fixed-text error event.
 */
export async function startRun(params: { phase: string; projectId: string; params?: Record<string, unknown>; exec: (context: RunContext) => Promise<void> }): Promise<string> {
	await connectDB();
	const run = await Run.create({ phase: params.phase, projectId: params.projectId, params: params.params ?? {} });
	const runId = String(run._id);
	const signal = registerRun(runId);
	const context: RunContext = {
		runId,
		signal,
		log: (type, message, progress) => appendEvent(runId, type, message, progress),
		onProcessStart: kill => attachKill(runId, kill)
	};
	void (async () => {
		try {
			await params.exec(context);
			await finish(runId, signal.aborted ? 'cancelled' : 'completed');
		} catch (error) {
			if (signal.aborted || error instanceof ClaudeCliCancelledError) {
				await appendEvent(runId, 'plan', 'Stopped by user.').catch(() => undefined);
				await finish(runId, 'cancelled').catch(() => undefined);
				return;
			}
			// Only these errors carry fixed text that is safe to show; anything else may hold paths or credentials.
			const known = error instanceof ClaudeCliError || error instanceof DatabaseUnavailableError || error instanceof WorkspacePathError || error instanceof StepPrerequisiteError;
			const safe = known ? error.message : 'The run failed unexpectedly.';
			await appendEvent(runId, 'error', safe).catch(() => undefined);
			await finish(runId, 'failed').catch(() => undefined);
		}
	})();
	return runId;
}

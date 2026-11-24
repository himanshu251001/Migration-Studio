/** Lifecycle of a background run on the real backend. */
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/** One line of a run's log, as stored and streamed. `type` is free text (`plan`, `tool_call`, `progress`, `error`, ...). */
export interface RunEvent {
	type: string;
	message: string;
	timestamp: string;
	/** Fraction complete (0..1), when the event reports progress. */
	progress?: number;
}

/** A run as returned by `GET /api/runs/<id>`. */
export interface RunInfo {
	id: string;
	projectId: string;
	phase: string;
	status: RunStatus;
	events: RunEvent[];
	startedAt: string;
	completedAt: string | null;
}

/** Last message of a run's event stream. */
export interface RunDoneEvent {
	type: 'done';
	status: RunStatus;
}

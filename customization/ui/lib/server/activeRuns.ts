/** An in-flight run: a flag for step loops to poll, and a handle to kill a spawned CLI process. */
interface ActiveRun {
	cancelled: boolean;
	kill?: () => void;
	/** Aborts everything started for this run (child processes, timers). */
	controller: AbortController;
}

declare global {
	var _migrationStudioActiveRuns: Map<string, ActiveRun> | undefined;
}

// Survives Next.js dev-mode module reloads, so Stop still reaches a run started before a reload.
const registry = globalThis._migrationStudioActiveRuns ?? new Map<string, ActiveRun>();
globalThis._migrationStudioActiveRuns = registry;

/** Starts tracking a run and returns the signal its executor must honour. */
export function registerRun(runId: string): AbortSignal {
	const controller = new AbortController();
	registry.set(runId, { cancelled: false, controller });
	return controller.signal;
}

/** Called by the Claude runner once the child process exists. */
export function attachKill(runId: string, kill: () => void): void {
	const entry = registry.get(runId);
	if (entry) {
		entry.kill = kill;
	}
}

export function isCancelled(runId: string): boolean {
	return registry.get(runId)?.cancelled ?? false;
}

/** Stops a tracked run. Returns false when nothing in this process tracks it (finished, or the server restarted). */
export function cancelRun(runId: string): boolean {
	const entry = registry.get(runId);
	if (!entry) {
		return false;
	}
	entry.cancelled = true;
	entry.kill?.();
	entry.controller.abort();
	return true;
}

export function unregisterRun(runId: string): void {
	registry.delete(runId);
}

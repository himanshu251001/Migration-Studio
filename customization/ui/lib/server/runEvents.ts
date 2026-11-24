import { EventEmitter } from 'node:events';
import type { RunEvent } from '@/features/migration/runs';

/** Fans a run's events out to every open SSE stream in this process. */
class RunEventBus extends EventEmitter {
	emitRunEvent(runId: string, event: RunEvent): void {
		this.emit(runId, event);
	}

	emitRunDone(runId: string): void {
		this.emit(`${runId}:done`);
	}
}

declare global {
	var _migrationStudioRunEventBus: RunEventBus | undefined;
}

export const runEventBus = globalThis._migrationStudioRunEventBus ?? new RunEventBus();
globalThis._migrationStudioRunEventBus = runEventBus;
runEventBus.setMaxListeners(100);

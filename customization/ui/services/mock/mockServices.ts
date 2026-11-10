import type { AnalysisResult } from '@/features/migration/analyze';
import type { ApproachDecision, ApproachResult } from '@/features/migration/approach';
import type { Project } from '@/features/migration/types';
import type { MigrationService } from '../types';
import { ANALYZE_FIXTURE } from './fixtures/analyze';
import { APPROACH_FIXTURE } from './fixtures/approach';

/** Simulated latency so loading states are real. */
function delay<T>(value: T, ms: number): Promise<T> {
	return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

const ANALYZE_DURATION_MS = 9000;
const TICK_MS = 100;
const APPROACH_DURATION_MS = 8000;

function decisionKey(project: Project): string {
	return `migration-studio-approach-${project.id}`;
}

/** Simulates a long running job: reports progress every tick and rejects with an `AbortError` when `signal` aborts. */
function simulateRun(durationMs: number, onProgress: (progress: number) => void, signal: AbortSignal, stoppedMessage: string): Promise<void> {
	return new Promise((resolve, reject) => {
		let progress = 0;
		const timer = setInterval(() => {
			progress = Math.min(1, progress + TICK_MS / durationMs);
			onProgress(progress);
			if (progress >= 1) {
				clearInterval(timer);
				signal.removeEventListener('abort', onAbort);
				resolve();
			}
		}, TICK_MS);
		const onAbort = () => {
			clearInterval(timer);
			reject(new DOMException(stoppedMessage, 'AbortError'));
		};
		if (signal.aborted) {
			onAbort();
		} else {
			signal.addEventListener('abort', onAbort, { once: true });
		}
	});
}

/** Pipeline stand-in until the backend exists (later phases). */
export class MockMigrationService implements MigrationService {
	start() {
		return delay(undefined, 1800);
	}

	getAnalysis(): Promise<AnalysisResult> {
		return delay(ANALYZE_FIXTURE, 250);
	}

	runAnalysis(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(ANALYZE_DURATION_MS, onProgress, signal, 'Analysis stopped');
	}

	getApproach(): Promise<ApproachResult> {
		return delay(APPROACH_FIXTURE, 250);
	}

	runApproach(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(APPROACH_DURATION_MS, onProgress, signal, 'Evaluation stopped');
	}

	async getApproachDecision(project: Project): Promise<ApproachDecision | undefined> {
		try {
			const raw = sessionStorage.getItem(decisionKey(project));
			return raw ? JSON.parse(raw) as ApproachDecision : undefined;
		} catch {
			return undefined;
		}
	}

	async lockApproach(project: Project, decision: ApproachDecision): Promise<void> {
		try {
			sessionStorage.setItem(decisionKey(project), JSON.stringify(decision));
		} catch {
			// not persisted
		}
	}

	async clearApproachDecision(project: Project): Promise<void> {
		try {
			sessionStorage.removeItem(decisionKey(project));
		} catch {
			// nothing to clear
		}
	}
}

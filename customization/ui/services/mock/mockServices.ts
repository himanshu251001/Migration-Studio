import type { AnalysisResult } from '@/features/migration/analyze';
import type { ApproachDecision, ApproachResult } from '@/features/migration/approach';
import type { IndexResult } from '@/features/migration/componentIndex';
import type { UnitsDecision, UnitsResult } from '@/features/migration/units';
import type { Project } from '@/features/migration/types';
import type { MigrationService } from '../types';
import { ANALYZE_FIXTURE } from './fixtures/analyze';
import { APPROACH_FIXTURE } from './fixtures/approach';
import { INDEX_FIXTURE } from './fixtures/componentIndex';
import { UNITS_FIXTURE } from './fixtures/units';

/** Simulated latency so loading states are real. */
function delay<T>(value: T, ms: number): Promise<T> {
	return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

const ANALYZE_DURATION_MS = 9000;
const TICK_MS = 100;
const APPROACH_DURATION_MS = 8000;
const INDEX_DURATION_MS = 8000;
const UNITS_DURATION_MS = 8000;
const CAPABILITY_ANALYSIS_MS = 2500;

function decisionKey(project: Project): string {
	return `migration-studio-approach-${project.id}`;
}

function analyzedKey(project: Project): string {
	return `migration-studio-index-analyzed-${project.id}`;
}

function unitsKey(project: Project): string {
	return `migration-studio-units-${project.id}`;
}

function readAnalyzed(project: Project): string[] {
	try {
		const raw = sessionStorage.getItem(analyzedKey(project));
		return raw ? JSON.parse(raw) as string[] : [];
	} catch {
		return [];
	}
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

	getIndex(): Promise<IndexResult> {
		return delay(INDEX_FIXTURE, 250);
	}

	runIndex(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(INDEX_DURATION_MS, onProgress, signal, 'Indexing stopped');
	}

	async getAnalyzedCapabilities(project: Project): Promise<readonly string[]> {
		return readAnalyzed(project);
	}

	async analyzeCapability(project: Project, capabilityId: string): Promise<void> {
		await delay(undefined, CAPABILITY_ANALYSIS_MS);
		try {
			sessionStorage.setItem(analyzedKey(project), JSON.stringify([...new Set([...readAnalyzed(project), capabilityId])]));
		} catch {
			// not persisted
		}
	}

	async clearAnalyzedCapabilities(project: Project): Promise<void> {
		try {
			sessionStorage.removeItem(analyzedKey(project));
		} catch {
			// nothing to clear
		}
	}

	getUnits(): Promise<UnitsResult> {
		return delay(UNITS_FIXTURE, 250);
	}

	runUnits(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(UNITS_DURATION_MS, onProgress, signal, 'Grouping stopped');
	}

	async getUnitsDecision(project: Project): Promise<UnitsDecision | undefined> {
		try {
			const raw = sessionStorage.getItem(unitsKey(project));
			return raw ? JSON.parse(raw) as UnitsDecision : undefined;
		} catch {
			return undefined;
		}
	}

	async saveUnitsDecision(project: Project, decision: UnitsDecision): Promise<void> {
		try {
			sessionStorage.setItem(unitsKey(project), JSON.stringify(decision));
		} catch {
			// not persisted
		}
	}

	async clearUnitsDecision(project: Project): Promise<void> {
		try {
			sessionStorage.removeItem(unitsKey(project));
		} catch {
			// nothing to clear
		}
	}
}

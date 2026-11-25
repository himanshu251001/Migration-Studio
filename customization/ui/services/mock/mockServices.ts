import type { AnalysisResult } from '@/features/migration/analyze';
import type { ApproachDecision, ApproachResult } from '@/features/migration/approach';
import type { IndexResult } from '@/features/migration/componentIndex';
import type { DependenciesResult } from '@/features/migration/dependencies';
import type { MilestonesDecision, MilestonesResult } from '@/features/migration/milestones';
import type { StoriesResult } from '@/features/migration/stories';
import type { RolloutDecision, RolloutResult } from '@/features/migration/rollout';
import type { ScopeDecision, ScopeResult } from '@/features/migration/scope';
import type { TargetDecision, TargetResult } from '@/features/migration/target';
import type { UnitsDecision, UnitsResult } from '@/features/migration/units';
import type { Project } from '@/features/migration/types';
import type { MigrationService } from '../types';
import { ANALYZE_FIXTURE } from './fixtures/analyze';
import { APPROACH_FIXTURE } from './fixtures/approach';
import { INDEX_FIXTURE } from './fixtures/componentIndex';
import { DEPENDENCIES_FIXTURE } from './fixtures/dependencies';
import { MILESTONES_FIXTURE } from './fixtures/milestones';
import { ROLLOUT_FIXTURE } from './fixtures/rollout';
import { SCOPE_FIXTURE } from './fixtures/scope';
import { TARGET_FIXTURE } from './fixtures/target';
import { STORIES_FIXTURE } from './fixtures/stories';
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
const DEPENDENCIES_DURATION_MS = 8000;
const SCOPE_DURATION_MS = 6000;
const GAP_ANALYSIS_DURATION_MS = 3000;
const TARGET_DURATION_MS = 8000;
const ROLLOUT_DURATION_MS = 8000;
const MILESTONES_DURATION_MS = 7000;
const MILESTONE_ANALYSIS_MS = 3000;
const STORIES_DURATION_MS = 9000;
const STORIES_REGENERATE_MS = 1200;
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

function scopeKey(project: Project): string {
	return `migration-studio-scope-${project.id}`;
}

function targetKey(project: Project): string {
	return `migration-studio-target-${project.id}`;
}

function rolloutKey(project: Project): string {
	return `migration-studio-rollout-${project.id}`;
}

function milestonesKey(project: Project): string {
	return `migration-studio-milestones-${project.id}`;
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

	getDependencies(): Promise<DependenciesResult> {
		return delay(DEPENDENCIES_FIXTURE, 250);
	}

	runDependencies(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(DEPENDENCIES_DURATION_MS, onProgress, signal, 'Tracing stopped');
	}

	getScope(): Promise<ScopeResult> {
		return delay(SCOPE_FIXTURE, 250);
	}

	runScope(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(SCOPE_DURATION_MS, onProgress, signal, 'Drafting stopped');
	}

	analyzeScopeGaps(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(GAP_ANALYSIS_DURATION_MS, onProgress, signal, 'Gap analysis stopped');
	}

	async getScopeDecision(project: Project): Promise<ScopeDecision | undefined> {
		try {
			const raw = sessionStorage.getItem(scopeKey(project));
			return raw ? JSON.parse(raw) as ScopeDecision : undefined;
		} catch {
			return undefined;
		}
	}

	async saveScopeDecision(project: Project, decision: ScopeDecision): Promise<void> {
		try {
			sessionStorage.setItem(scopeKey(project), JSON.stringify(decision));
		} catch {
			// not persisted
		}
	}

	async clearScopeDecision(project: Project): Promise<void> {
		try {
			sessionStorage.removeItem(scopeKey(project));
		} catch {
			// nothing to clear
		}
	}

	getTarget(): Promise<TargetResult> {
		return delay(TARGET_FIXTURE, 250);
	}

	runTarget(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(TARGET_DURATION_MS, onProgress, signal, 'Mapping stopped');
	}

	async getTargetDecision(project: Project): Promise<TargetDecision | undefined> {
		try {
			const raw = sessionStorage.getItem(targetKey(project));
			return raw ? JSON.parse(raw) as TargetDecision : undefined;
		} catch {
			return undefined;
		}
	}

	async saveTargetDecision(project: Project, decision: TargetDecision): Promise<void> {
		try {
			sessionStorage.setItem(targetKey(project), JSON.stringify(decision));
		} catch {
			// not persisted
		}
	}

	async clearTargetDecision(project: Project): Promise<void> {
		try {
			sessionStorage.removeItem(targetKey(project));
		} catch {
			// nothing to clear
		}
	}

	getRollout(): Promise<RolloutResult> {
		return delay(ROLLOUT_FIXTURE, 250);
	}

	runRollout(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(ROLLOUT_DURATION_MS, onProgress, signal, 'Planning stopped');
	}

	async getRolloutDecision(project: Project): Promise<RolloutDecision | undefined> {
		try {
			const raw = sessionStorage.getItem(rolloutKey(project));
			return raw ? JSON.parse(raw) as RolloutDecision : undefined;
		} catch {
			return undefined;
		}
	}

	async saveRolloutDecision(project: Project, decision: RolloutDecision): Promise<void> {
		try {
			sessionStorage.setItem(rolloutKey(project), JSON.stringify(decision));
		} catch {
			// not persisted
		}
	}

	async clearRolloutDecision(project: Project): Promise<void> {
		try {
			sessionStorage.removeItem(rolloutKey(project));
		} catch {
			// nothing to clear
		}
	}

	getMilestones(): Promise<MilestonesResult> {
		return delay(MILESTONES_FIXTURE, 250);
	}

	runMilestones(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(MILESTONES_DURATION_MS, onProgress, signal, 'Scheduling stopped');
	}

	analyzeMilestone(_project: unknown, _milestoneId: string, signal: AbortSignal): Promise<void> {
		return simulateRun(MILESTONE_ANALYSIS_MS, () => undefined, signal, 'Analysis stopped');
	}

	async getMilestonesDecision(project: Project): Promise<MilestonesDecision | undefined> {
		try {
			const raw = sessionStorage.getItem(milestonesKey(project));
			return raw ? JSON.parse(raw) as MilestonesDecision : undefined;
		} catch {
			return undefined;
		}
	}

	async saveMilestonesDecision(project: Project, decision: MilestonesDecision): Promise<void> {
		try {
			sessionStorage.setItem(milestonesKey(project), JSON.stringify(decision));
		} catch {
			// not persisted
		}
	}

	async clearMilestonesDecision(project: Project): Promise<void> {
		try {
			sessionStorage.removeItem(milestonesKey(project));
		} catch {
			// nothing to clear
		}
	}

	getStories(): Promise<StoriesResult> {
		return delay(STORIES_FIXTURE, 250);
	}

	runStories(_project: unknown, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		return simulateRun(STORIES_DURATION_MS, onProgress, signal, 'Breakdown stopped');
	}

	regenerateStories(_project: unknown, _milestoneId: string, _storyId: string | undefined, signal: AbortSignal): Promise<void> {
		return simulateRun(STORIES_REGENERATE_MS, () => undefined, signal, 'Generation stopped');
	}
}

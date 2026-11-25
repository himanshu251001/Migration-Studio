import type { AnalysisResult } from '@/features/migration/analyze';
import type { ApproachDecision, ApproachResult } from '@/features/migration/approach';
import type { ReviewComment } from '@/features/migration/comments';
import type { IndexResult } from '@/features/migration/componentIndex';
import type { DependenciesResult } from '@/features/migration/dependencies';
import type { RolloutDecision, RolloutResult } from '@/features/migration/rollout';
import type { ScopeDecision, ScopeResult } from '@/features/migration/scope';
import type { TargetDecision, TargetResult } from '@/features/migration/target';
import type { UnitsDecision, UnitsResult } from '@/features/migration/units';
import type { Project } from '@/features/migration/types';
import type { MigrationService } from '../types';
import { runStep } from './runClient';

const NOT_IMPLEMENTED = 'The Claude CLI backend is not available for this step yet. Switch to Mock data in Settings.';

async function readJson<T>(response: Response): Promise<T> {
	const data = await response.json().catch(() => ({})) as T & { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? `Request failed (${response.status}).`);
	}
	return data;
}

function url(path: string, project: Project): string {
	return `${path}?projectId=${encodeURIComponent(project.id)}`;
}

/** The steps already built on the real pipeline (Claude CLI + MongoDB). */
const implemented: Partial<MigrationService> = {
	start: () => Promise.resolve(),

	async getAnalysis(project: Project): Promise<AnalysisResult> {
		return readJson<AnalysisResult>(await fetch(url('/api/migration/analyze', project)));
	},

	async runAnalysis(project: Project, onProgress: (progress: number) => void, signal: AbortSignal, comments?: readonly ReviewComment[], onLog?: (line: string) => void): Promise<void> {
		const notes = (comments ?? []).map(({ artifact, line, text }) => ({ artifact, line, text }));
		await runStep('/api/migration/analyze', { projectId: project.id, comments: notes }, onProgress, signal, onLog);
	},

	async getApproach(project: Project): Promise<ApproachResult> {
		return readJson<ApproachResult>(await fetch(url('/api/migration/approach', project)));
	},

	async runApproach(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		await runStep('/api/migration/approach', { projectId: project.id }, onProgress, signal);
	},

	async getApproachDecision(project: Project): Promise<ApproachDecision | undefined> {
		const { decision } = await readJson<{ decision: ApproachDecision | null }>(await fetch(url('/api/migration/approach/decision', project)));
		return decision ?? undefined;
	},

	async lockApproach(project: Project, decision: ApproachDecision): Promise<void> {
		await readJson(await fetch('/api/migration/approach/decision', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, decision }) }));
	},

	async clearApproachDecision(project: Project): Promise<void> {
		await readJson(await fetch(url('/api/migration/approach/decision', project), { method: 'DELETE' }));
	},

	async getIndex(project: Project): Promise<IndexResult> {
		return readJson<IndexResult>(await fetch(url('/api/migration/index', project)));
	},

	async runIndex(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		await runStep('/api/migration/index', { projectId: project.id }, onProgress, signal);
	},

	async getAnalyzedCapabilities(project: Project): Promise<readonly string[]> {
		const { ids } = await readJson<{ ids: string[] }>(await fetch(url('/api/migration/index/analyzed', project)));
		return ids;
	},

	async analyzeCapability(project: Project, capabilityId: string): Promise<void> {
		// The deep analysis has no Stop in the UI; it runs to the end like any other run.
		await runStep('/api/migration/index/analyze', { projectId: project.id, capabilityId }, () => undefined, undefined);
	},

	async clearAnalyzedCapabilities(project: Project): Promise<void> {
		await readJson(await fetch(url('/api/migration/index/analyzed', project), { method: 'DELETE' }));
	},

	async getUnits(project: Project): Promise<UnitsResult> {
		return readJson<UnitsResult>(await fetch(url('/api/migration/units', project)));
	},

	async runUnits(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		await runStep('/api/migration/units', { projectId: project.id }, onProgress, signal);
	},

	async getUnitsDecision(project: Project): Promise<UnitsDecision | undefined> {
		const { decision } = await readJson<{ decision: UnitsDecision | null }>(await fetch(url('/api/migration/units/decision', project)));
		return decision ?? undefined;
	},

	async saveUnitsDecision(project: Project, decision: UnitsDecision): Promise<void> {
		await readJson(await fetch('/api/migration/units/decision', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, decision }) }));
	},

	async clearUnitsDecision(project: Project): Promise<void> {
		await readJson(await fetch(url('/api/migration/units/decision', project), { method: 'DELETE' }));
	},

	async getDependencies(project: Project): Promise<DependenciesResult> {
		return readJson<DependenciesResult>(await fetch(url('/api/migration/dependencies', project)));
	},

	async runDependencies(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		await runStep('/api/migration/dependencies', { projectId: project.id }, onProgress, signal);
	},

	async getScope(project: Project): Promise<ScopeResult> {
		return readJson<ScopeResult>(await fetch(url('/api/migration/scope', project)));
	},

	async runScope(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		await runStep('/api/migration/scope', { projectId: project.id }, onProgress, signal);
	},

	async analyzeScopeGaps(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		await runStep('/api/migration/scope/gaps', { projectId: project.id }, onProgress, signal);
	},

	async getScopeDecision(project: Project): Promise<ScopeDecision | undefined> {
		const { decision } = await readJson<{ decision: ScopeDecision | null }>(await fetch(url('/api/migration/scope/decision', project)));
		return decision ?? undefined;
	},

	async saveScopeDecision(project: Project, decision: ScopeDecision): Promise<void> {
		await readJson(await fetch('/api/migration/scope/decision', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, decision }) }));
	},

	async clearScopeDecision(project: Project): Promise<void> {
		await readJson(await fetch(url('/api/migration/scope/decision', project), { method: 'DELETE' }));
	},

	async getTarget(project: Project): Promise<TargetResult> {
		return readJson<TargetResult>(await fetch(url('/api/migration/target', project)));
	},

	async runTarget(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		await runStep('/api/migration/target', { projectId: project.id }, onProgress, signal);
	},

	async getTargetDecision(project: Project): Promise<TargetDecision | undefined> {
		const { decision } = await readJson<{ decision: TargetDecision | null }>(await fetch(url('/api/migration/target/decision', project)));
		return decision ?? undefined;
	},

	async saveTargetDecision(project: Project, decision: TargetDecision): Promise<void> {
		await readJson(await fetch('/api/migration/target/decision', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, decision }) }));
	},

	async clearTargetDecision(project: Project): Promise<void> {
		await readJson(await fetch(url('/api/migration/target/decision', project), { method: 'DELETE' }));
	},

	async getRollout(project: Project): Promise<RolloutResult> {
		return readJson<RolloutResult>(await fetch(url('/api/migration/rollout', project)));
	},

	async runRollout(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
		await runStep('/api/migration/rollout', { projectId: project.id }, onProgress, signal);
	},

	async getRolloutDecision(project: Project): Promise<RolloutDecision | undefined> {
		const { decision } = await readJson<{ decision: RolloutDecision | null }>(await fetch(url('/api/migration/rollout/decision', project)));
		return decision ?? undefined;
	},

	async saveRolloutDecision(project: Project, decision: RolloutDecision): Promise<void> {
		await readJson(await fetch('/api/migration/rollout/decision', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, decision }) }));
	},

	async clearRolloutDecision(project: Project): Promise<void> {
		await readJson(await fetch(url('/api/migration/rollout/decision', project), { method: 'DELETE' }));
	}
};

/**
 * The real pipeline. Steps that are built are served by `implemented`; every other operation fails with a clear
 * message until its phase is built, and the steps then replace these one by one.
 */
export class HttpMigrationService {
	constructor() {
		return new Proxy(this, {
			get: (target, prop, receiver) => {
				if (prop === 'then' || typeof prop === 'symbol') {
					return Reflect.get(target, prop, receiver);
				}
				return (implemented as Record<string, unknown>)[prop] ?? (() => Promise.reject(new Error(NOT_IMPLEMENTED)));
			}
		});
	}
}

export interface HttpMigrationService extends MigrationService { }

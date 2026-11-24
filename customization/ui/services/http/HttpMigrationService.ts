import type { AnalysisResult } from '@/features/migration/analyze';
import type { ApproachDecision, ApproachResult } from '@/features/migration/approach';
import type { ReviewComment } from '@/features/migration/comments';
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

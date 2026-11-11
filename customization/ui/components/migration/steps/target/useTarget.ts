'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TargetResult } from '@/features/migration/target';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

export interface TargetState {
	readonly target: TargetResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	/** Ids of approved mappings. Only meaningful once `ready`. */
	readonly approved: readonly string[];
	/** Name of the target stack the reviewer locked in the Scope step, if any. */
	readonly targetStack: string | undefined;
	/** False until the saved approvals have been read. */
	readonly ready: boolean;
	readonly error: string | undefined;
	approve(mappingId: string): void;
	/** Discards the approvals so a re-map starts clean. */
	discard(): Promise<void>;
}

/**
 * Loads the mappings and approvals and, on the running screen, maps the technology. Mount once per screen (key the
 * component by screen); the run is aborted on unmount, which is how Stop works.
 */
export function useTarget(project: Project, running: boolean): TargetState {
	const { migration } = useServices();
	const [target, setTarget] = useState<TargetResult>();
	const [approved, setApproved] = useState<readonly string[]>([]);
	const [targetStack, setTargetStack] = useState<string>();
	const [ready, setReady] = useState(false);
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const [result, saved, scope, scopeDecision] = await Promise.all([
					migration.getTarget(project),
					migration.getTargetDecision(project),
					migration.getScope(project),
					migration.getScopeDecision(project)
				]);
				if (controller.signal.aborted) {
					return;
				}
				const ids = result.mappings.map(m => m.id);
				setTarget(result);
				// Ignore approvals for mappings that no longer exist.
				setApproved(saved ? saved.approved.filter(id => ids.includes(id)) : []);
				setTargetStack(scopeDecision?.stack === 'other' ? scopeDecision.customStack?.trim() : scope.stacks.find(s => s.id === scopeDecision?.stack)?.name);
				setReady(true);
				if (running) {
					await migration.runTarget(project, setProgress, controller.signal);
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Mapping failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running]);

	const approve = useCallback((mappingId: string) => {
		if (approved.includes(mappingId)) {
			return;
		}
		const next = [...approved, mappingId];
		setApproved(next);
		void migration.saveTargetDecision(project, { approved: next });
	}, [migration, project, approved]);

	const discard = useCallback(async () => {
		await migration.clearTargetDecision(project);
	}, [migration, project]);

	return { target, progress, complete: !!target && progress >= 1, approved, targetStack, ready, error, approve, discard };
}

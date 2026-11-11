'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ScopeDecision, ScopeResult } from '@/features/migration/scope';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

export const CUSTOM_STACK = 'other';

export interface ScopeState {
	readonly scope: ScopeResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	/** The reviewer's choices so far. Only meaningful once `ready`. */
	readonly decision: ScopeDecision;
	/** False until the saved decision has been read. */
	readonly ready: boolean;
	readonly error: string | undefined;
	/** Merges `change` into the choices and saves them. Ignored once locked. */
	update(change: Partial<Omit<ScopeDecision, 'locked'>>): void;
	/** Locks the target stack. */
	lock(): Promise<void>;
	/** Discards the choices so a revision starts clean. */
	discard(): Promise<void>;
}

/** Loads the scope and the reviewer's choices and, on the running screen, drafts the scope. Mount once per screen. */
export function useScope(project: Project, running: boolean): ScopeState {
	const { migration } = useServices();
	const [scope, setScope] = useState<ScopeResult>();
	const [decision, setDecision] = useState<ScopeDecision>({ database: '', strategy: '', resolutions: {}, locked: false });
	const [ready, setReady] = useState(false);
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const [result, saved] = await Promise.all([migration.getScope(project), migration.getScopeDecision(project)]);
				if (controller.signal.aborted) {
					return;
				}
				setScope(result);
				setDecision(saved ?? { database: result.databases[0], strategy: result.strategies[0], resolutions: {}, locked: false });
				setReady(true);
				if (running) {
					await migration.runScope(project, setProgress, controller.signal);
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Scope drafting failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running]);

	const update = useCallback((change: Partial<Omit<ScopeDecision, 'locked'>>) => {
		if (decision.locked) {
			return;
		}
		const next = { ...decision, ...change };
		setDecision(next);
		void migration.saveScopeDecision(project, next);
	}, [migration, project, decision]);

	const lock = useCallback(async () => {
		const next = { ...decision, locked: true };
		await migration.saveScopeDecision(project, next);
		setDecision(next);
	}, [migration, project, decision]);

	const discard = useCallback(async () => {
		await migration.clearScopeDecision(project);
	}, [migration, project]);

	return { scope, progress, complete: !!scope && progress >= 1, decision, ready, error, update, lock, discard };
}

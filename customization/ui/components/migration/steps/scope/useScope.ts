'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
	/** True while the gap analysis for the current selection runs. */
	readonly gapsRunning: boolean;
	/** 0..1 while `gapsRunning`. */
	readonly gapsProgress: number;
	/** Why the last save, lock or gap analysis failed, if it did. */
	readonly actionError: string | undefined;
	/** Finds the gaps for the selected stack, database and strategy. Changing any of them discards the result. */
	analyzeGaps(): Promise<void>;
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
	const [gapsRunning, setGapsRunning] = useState(false);
	const [gapsProgress, setGapsProgress] = useState(0);
	const [actionError, setActionError] = useState<string>();
	// The last save in flight, so the gap analysis starts from the saved selection.
	const pendingSave = useRef<Promise<unknown>>(Promise.resolve());
	const gapController = useRef<AbortController | undefined>(undefined);

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
					// The real backend only has the scope once the run is over; the mock returns the same result.
					const [finished, fresh] = await Promise.all([migration.getScope(project), migration.getScopeDecision(project)]);
					if (!controller.signal.aborted) {
						setScope(finished);
						setDecision(fresh ?? { database: finished.databases[0], strategy: finished.strategies[0], resolutions: {}, locked: false });
					}
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
		const selectionChanged = (['stack', 'customStack', 'database', 'strategy'] as const).some(key => key in change && change[key] !== decision[key]);
		pendingSave.current = (async () => {
			try {
				await pendingSave.current;
				await migration.saveScopeDecision(project, next);
				// The gaps belong to the selection they were analyzed for: a different one discards them, so read them again.
				if (selectionChanged && scope?.gapsReady) {
					const [fresh, saved] = await Promise.all([migration.getScope(project), migration.getScopeDecision(project)]);
					setScope(fresh);
					setDecision(saved ?? next);
				}
			} catch (e) {
				setActionError(e instanceof Error ? e.message : 'Saving failed');
			}
		})();
	}, [migration, project, decision, scope]);

	const lock = useCallback(async () => {
		try {
			await pendingSave.current;
			const next = { ...decision, locked: true };
			await migration.saveScopeDecision(project, next);
			setDecision(next);
			setActionError(undefined);
		} catch (e) {
			setActionError(e instanceof Error ? e.message : 'Locking failed');
		}
	}, [migration, project, decision]);

	const analyzeGaps = useCallback(async () => {
		const controller = new AbortController();
		gapController.current = controller;
		setActionError(undefined);
		setGapsProgress(0);
		setGapsRunning(true);
		try {
			await pendingSave.current;
			await migration.analyzeScopeGaps(project, setGapsProgress, controller.signal);
			const [fresh, saved] = await Promise.all([migration.getScope(project), migration.getScopeDecision(project)]);
			if (!controller.signal.aborted) {
				setScope(fresh);
				if (saved) {
					setDecision(saved);
				}
			}
		} catch (e) {
			if (!controller.signal.aborted) {
				setActionError(e instanceof Error ? e.message : 'Gap analysis failed');
			}
		} finally {
			if (!controller.signal.aborted) {
				setGapsRunning(false);
			}
		}
	}, [migration, project]);

	// Leaving the screen stops a gap analysis in flight.
	useEffect(() => () => gapController.current?.abort(), []);

	const discard = useCallback(async () => {
		await migration.clearScopeDecision(project);
	}, [migration, project]);

	return { scope, progress, complete: !!scope && progress >= 1, decision, ready, error, gapsRunning, gapsProgress, actionError, analyzeGaps, update, lock, discard };
}

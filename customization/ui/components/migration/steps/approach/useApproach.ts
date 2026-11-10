'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApproachDecision, ApproachResult } from '@/features/migration/approach';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

export interface ApproachState {
	readonly approach: ApproachResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	/** The locked strategy; `undefined` until locked. Only meaningful once `ready`. */
	readonly decision: ApproachDecision | undefined;
	/** False until the saved decision has been read. */
	readonly ready: boolean;
	readonly error: string | undefined;
	lock(decision: ApproachDecision): Promise<void>;
	/** Discards the locked strategy so a re-run starts clean. */
	discard(): Promise<void>;
}

/**
 * Loads the evaluated strategies and the reviewer's decision and, on the running screen, runs the evaluation.
 * Mount once per screen (key the component by screen); the run is aborted on unmount, which is how Stop works.
 */
export function useApproach(project: Project, running: boolean): ApproachState {
	const { migration } = useServices();
	const [approach, setApproach] = useState<ApproachResult>();
	const [decision, setDecision] = useState<ApproachDecision>();
	const [ready, setReady] = useState(false);
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const [result, saved] = await Promise.all([migration.getApproach(project), migration.getApproachDecision(project)]);
				if (controller.signal.aborted) {
					return;
				}
				setApproach(result);
				setDecision(saved);
				setReady(true);
				if (running) {
					await migration.runApproach(project, setProgress, controller.signal);
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Strategy evaluation failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running]);

	const lock = useCallback(async (value: ApproachDecision) => {
		await migration.lockApproach(project, value);
		setDecision(value);
	}, [migration, project]);

	const discard = useCallback(async () => {
		await migration.clearApproachDecision(project);
		setDecision(undefined);
	}, [migration, project]);

	return { approach, progress, complete: !!approach && progress >= 1, decision, ready, error, lock, discard };
}

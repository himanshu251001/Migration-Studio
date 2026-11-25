'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RolloutResult } from '@/features/migration/rollout';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

export interface RolloutState {
	readonly rollout: RolloutResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	/** True once the reviewer has locked the strategy. Only meaningful once `ready`. */
	readonly locked: boolean;
	/** False until the saved sign-off has been read. */
	readonly ready: boolean;
	readonly error: string | undefined;
	/** Locks the migration strategy. */
	lock(): Promise<void>;
	/** Discards the sign-off so a re-plan starts clean. */
	discard(): Promise<void>;
}

/** Loads the rollout and the sign-off and, on the running screen, plans the rollout. Mount once per screen. */
export function useRollout(project: Project, running: boolean): RolloutState {
	const { migration } = useServices();
	const [rollout, setRollout] = useState<RolloutResult>();
	const [locked, setLocked] = useState(false);
	const [ready, setReady] = useState(false);
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const [result, saved] = await Promise.all([migration.getRollout(project), migration.getRolloutDecision(project)]);
				if (controller.signal.aborted) {
					return;
				}
				setRollout(result);
				setLocked(!!saved?.locked);
				setReady(true);
				if (running) {
					await migration.runRollout(project, setProgress, controller.signal);
					// The real backend only has the strategy once the run is over; the mock returns the same result.
					const [finished, fresh] = await Promise.all([migration.getRollout(project), migration.getRolloutDecision(project)]);
					if (!controller.signal.aborted) {
						setRollout(finished);
						setLocked(!!fresh?.locked);
					}
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Rollout planning failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running]);

	const lock = useCallback(async () => {
		await migration.saveRolloutDecision(project, { locked: true });
		setLocked(true);
	}, [migration, project]);

	const discard = useCallback(async () => {
		await migration.clearRolloutDecision(project);
	}, [migration, project]);

	return { rollout, progress, complete: !!rollout && progress >= 1, locked, ready, error, lock, discard };
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@/features/migration/types';
import type { UnitsDecision, UnitsResult } from '@/features/migration/units';
import { useServices } from '@/services/ServiceProvider';

export interface UnitsState {
	readonly units: UnitsResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	/** Unit ids in the reviewer's order. */
	readonly order: readonly string[];
	readonly locked: boolean;
	/** False until the saved order has been read. */
	readonly ready: boolean;
	readonly error: string | undefined;
	/** Moves the unit at `index` one place up (-1) or down (1). */
	move(index: number, direction: -1 | 1): void;
	lock(): Promise<void>;
	/** Discards the saved order and lock so a regroup starts clean. */
	discard(): Promise<void>;
}

/**
 * Loads the migration units and the reviewer's order and, on the running screen, groups them. Mount once per screen
 * (key the component by screen); the run is aborted on unmount, which is how Stop works.
 */
export function useUnits(project: Project, running: boolean): UnitsState {
	const { migration } = useServices();
	const [units, setUnits] = useState<UnitsResult>();
	const [order, setOrder] = useState<readonly string[]>([]);
	const [locked, setLocked] = useState(false);
	const [ready, setReady] = useState(false);
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const [result, saved] = await Promise.all([migration.getUnits(project), migration.getUnitsDecision(project)]);
				if (controller.signal.aborted) {
					return;
				}
				const ids = result.units.map(u => u.id);
				// Ignore a saved order that no longer matches the units.
				const valid = saved && saved.order.length === ids.length && ids.every(id => saved.order.includes(id));
				setUnits(result);
				setOrder(valid ? saved.order : ids);
				setLocked(!!valid && saved.locked);
				setReady(true);
				if (running) {
					await migration.runUnits(project, setProgress, controller.signal);
					// The real backend only has the units once the run is over; the mock returns the same result.
					const [finished, fresh] = await Promise.all([migration.getUnits(project), migration.getUnitsDecision(project)]);
					if (!controller.signal.aborted) {
						const finishedIds = finished.units.map(u => u.id);
						setUnits(finished);
						setOrder(fresh && fresh.order.length === finishedIds.length && finishedIds.every(id => fresh.order.includes(id)) ? fresh.order : finishedIds);
						setLocked(!!fresh && fresh.locked);
					}
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Grouping failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running]);

	const move = useCallback((index: number, direction: -1 | 1) => {
		if (locked || index + direction < 0 || index + direction >= order.length) {
			return;
		}
		const next = [...order];
		[next[index], next[index + direction]] = [next[index + direction], next[index]];
		setOrder(next);
		void migration.saveUnitsDecision(project, { order: next, locked: false });
	}, [migration, project, order, locked]);

	const lock = useCallback(async () => {
		await migration.saveUnitsDecision(project, { order, locked: true });
		setLocked(true);
	}, [migration, project, order]);

	const discard = useCallback(async () => {
		await migration.clearUnitsDecision(project);
		setLocked(false);
	}, [migration, project]);

	return { units, progress, complete: !!units && progress >= 1, order, locked, ready, error, move, lock, discard };
}

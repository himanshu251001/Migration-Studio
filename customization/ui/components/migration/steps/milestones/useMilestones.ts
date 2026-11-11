'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MilestonesDecision, MilestonesResult } from '@/features/migration/milestones';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

/** Progress of the optional deep analysis of one milestone. */
export interface DeepAnalysis {
	readonly state: 'idle' | 'running' | 'done';
	/** When the last analysis finished. */
	readonly at?: Date;
}

export interface MilestonesState {
	readonly milestones: MilestonesResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	/** The reviewer's renames and sign-off. Only meaningful once `ready`. */
	readonly decision: MilestonesDecision;
	/** Deep analysis per milestone id; absent means idle. */
	readonly analysis: Readonly<Record<string, DeepAnalysis>>;
	/** False until the saved decision has been read. */
	readonly ready: boolean;
	readonly error: string | undefined;
	/** The reviewer's name for a milestone, or its drafted name. */
	nameOf(id: string, drafted: string): string;
	/** Renames a milestone. Ignored once locked. */
	rename(id: string, name: string): void;
	/** Locks the milestone plan. */
	lock(): Promise<void>;
	/** Starts the deep analysis of a milestone. */
	analyze(id: string): void;
	/** Aborts a running deep analysis. */
	stopAnalysis(id: string): void;
	/** Discards the renames and sign-off so a re-plan starts clean. */
	discard(): Promise<void>;
}

/** Loads the milestone plan and the reviewer's edits and, on the running screen, schedules the milestones. Mount once per screen. */
export function useMilestones(project: Project, running: boolean): MilestonesState {
	const { migration } = useServices();
	const [milestones, setMilestones] = useState<MilestonesResult>();
	const [decision, setDecision] = useState<MilestonesDecision>({ names: {}, locked: false });
	const [analysis, setAnalysis] = useState<Record<string, DeepAnalysis>>({});
	const [ready, setReady] = useState(false);
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();
	const controllers = useRef(new Map<string, AbortController>());

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const [result, saved] = await Promise.all([migration.getMilestones(project), migration.getMilestonesDecision(project)]);
				if (controller.signal.aborted) {
					return;
				}
				setMilestones(result);
				setDecision(saved ?? { names: {}, locked: false });
				setReady(true);
				if (running) {
					await migration.runMilestones(project, setProgress, controller.signal);
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Milestone scheduling failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running]);

	// Deep analyses are aborted when the screen goes away.
	useEffect(() => {
		const active = controllers.current;
		return () => {
			active.forEach(c => c.abort());
			active.clear();
		};
	}, []);

	const nameOf = useCallback((id: string, drafted: string) => decision.names[id] ?? drafted, [decision.names]);

	const rename = useCallback((id: string, name: string) => {
		if (decision.locked) {
			return;
		}
		const next = { ...decision, names: { ...decision.names, [id]: name } };
		setDecision(next);
		void migration.saveMilestonesDecision(project, next);
	}, [migration, project, decision]);

	const lock = useCallback(async () => {
		const next = { ...decision, locked: true };
		await migration.saveMilestonesDecision(project, next);
		setDecision(next);
	}, [migration, project, decision]);

	const analyze = useCallback((id: string) => {
		controllers.current.get(id)?.abort();
		const controller = new AbortController();
		controllers.current.set(id, controller);
		setAnalysis(a => ({ ...a, [id]: { state: 'running' } }));
		migration.analyzeMilestone(project, id, controller.signal).then(
			() => {
				controllers.current.delete(id);
				setAnalysis(a => ({ ...a, [id]: { state: 'done', at: new Date() } }));
			},
			() => {
				// Aborted: stopAnalysis already reset the state.
			}
		);
	}, [migration, project]);

	const stopAnalysis = useCallback((id: string) => {
		controllers.current.get(id)?.abort();
		controllers.current.delete(id);
		setAnalysis(a => ({ ...a, [id]: { state: 'idle' } }));
	}, []);

	const discard = useCallback(async () => {
		await migration.clearMilestonesDecision(project);
	}, [migration, project]);

	return { milestones, progress, complete: !!milestones && progress >= 1, decision, analysis, ready, error, nameOf, rename, lock, analyze, stopAnalysis, discard };
}

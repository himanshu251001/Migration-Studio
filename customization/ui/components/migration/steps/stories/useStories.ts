'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '@/features/migration/types';
import type { BacklogMilestone, StoriesResult } from '@/features/migration/stories';
import { useServices } from '@/services/ServiceProvider';

export interface StoriesState {
	readonly result: StoriesResult | undefined;
	/** The milestones, named as the reviewer left them, each with its stories. Empty until `ready`. */
	readonly plan: readonly BacklogMilestone[];
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	/** Keys of the generations in flight: a milestone id, or a story id. */
	readonly busy: readonly string[];
	/** False until the milestones and stories have been read. */
	readonly ready: boolean;
	readonly error: string | undefined;
	/** Re-runs the pipeline for a milestone, or only the tasks of one story of it. */
	regenerate(milestoneId: string, storyId?: string): void;
}

/** Loads the stories with the milestones they belong to and, on the running screen, writes them. Mount once per screen. */
export function useStories(project: Project, running: boolean): StoriesState {
	const { migration } = useServices();
	const [result, setResult] = useState<StoriesResult>();
	const [plan, setPlan] = useState<readonly BacklogMilestone[]>([]);
	const [busy, setBusy] = useState<readonly string[]>([]);
	const [ready, setReady] = useState(false);
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();
	const controller = useRef<AbortController | undefined>(undefined);

	/** Reads the stories and the milestones they belong to; `false` when the screen went away meanwhile. */
	const load = useCallback(async (signal: AbortSignal): Promise<boolean> => {
		const [stories, milestones, decision] = await Promise.all([
			migration.getStories(project),
			migration.getMilestones(project),
			migration.getMilestonesDecision(project)
		]);
		if (signal.aborted) {
			return false;
		}
		setResult(stories);
		setPlan(milestones.milestones.map(m => ({
			...m,
			name: decision?.names[m.id] ?? m.name,
			stories: stories.stories.filter(s => s.milestoneId === m.id)
		})));
		return true;
	}, [migration, project]);

	useEffect(() => {
		const abort = new AbortController();
		controller.current = abort;
		(async () => {
			try {
				if (!await load(abort.signal)) {
					return;
				}
				setReady(true);
				if (running) {
					await migration.runStories(project, setProgress, abort.signal);
					// The real backend only has the stories once the run is over; the mock returns the same result.
					await load(abort.signal);
					setProgress(1);
				}
			} catch (e) {
				if (!abort.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Story breakdown failed');
				}
			}
		})();
		// Aborts the run (Stop) and any generation in flight when the screen goes away.
		return () => abort.abort();
	}, [migration, project, running, load]);

	const regenerate = useCallback((milestoneId: string, storyId?: string) => {
		const key = storyId ?? milestoneId;
		const signal = controller.current?.signal;
		if (!signal || busy.includes(key)) {
			return;
		}
		setBusy(b => [...b, key]);
		migration.regenerateStories(project, milestoneId, storyId, signal).then(
			() => load(signal),
			() => false
		).finally(() => setBusy(b => b.filter(k => k !== key)));
	}, [migration, project, busy, load]);

	return { result, plan, progress, complete: !!result && progress >= 1, busy, ready, error, regenerate };
}

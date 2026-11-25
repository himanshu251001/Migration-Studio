'use client';

import { useEffect, useState } from 'react';
import type { DependenciesResult } from '@/features/migration/dependencies';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

export interface DependenciesState {
	readonly dependencies: DependenciesResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	readonly error: string | undefined;
}

/**
 * Loads the cross-unit dependencies and, on the running screen, traces them. Mount once per screen (key the component
 * by screen); the run is aborted on unmount, which is how Stop works.
 */
export function useDependencies(project: Project, running: boolean): DependenciesState {
	const { migration } = useServices();
	const [dependencies, setDependencies] = useState<DependenciesResult>();
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const result = await migration.getDependencies(project);
				if (controller.signal.aborted) {
					return;
				}
				setDependencies(result);
				if (running) {
					await migration.runDependencies(project, setProgress, controller.signal);
					// The real backend only has the analysis once the run is over; the mock returns the same result.
					const finished = await migration.getDependencies(project);
					if (!controller.signal.aborted) {
						setDependencies(finished);
					}
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Tracing failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running]);

	return { dependencies, progress, complete: !!dependencies && progress >= 1, error };
}

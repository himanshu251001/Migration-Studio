'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '@/features/migration/analyze';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';
import { useMigration } from '@/state/MigrationProvider';

export interface AnalyzeState {
	readonly analysis: AnalysisResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	readonly error: string | undefined;
}

/**
 * Loads the analysis and, on the running screen, runs it. Mount once per screen (key the component by screen),
 * the run is aborted on unmount, which is how Stop works.
 */
export function useAnalyze(project: Project, running: boolean): AnalyzeState {
	const { migration } = useServices();
	const { analyzeRerunComments } = useMigration();
	// Read through a ref: clearing the comments once the run finishes must not restart the run.
	const commentsRef = useRef(analyzeRerunComments);
	commentsRef.current = analyzeRerunComments;
	const [analysis, setAnalysis] = useState<AnalysisResult>();
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const result = await migration.getAnalysis(project);
				if (controller.signal.aborted) {
					return;
				}
				setAnalysis(result);
				if (running) {
					await migration.runAnalysis(project, setProgress, controller.signal, commentsRef.current);
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Analysis failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running]);

	return { analysis, progress, complete: !!analysis && progress >= 1, error };
}

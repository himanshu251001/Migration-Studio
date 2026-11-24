'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '@/features/migration/analyze';
import type { Project } from '@/features/migration/types';
import { getBackendMode } from '@/lib/backendMode';
import { useServices } from '@/services/ServiceProvider';
import { useMigration } from '@/state/MigrationProvider';

export interface AnalyzeState {
	readonly analysis: AnalysisResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	readonly error: string | undefined;
	/** Real run in progress: findings and log lines arrive as the run goes instead of being replayed from a stored result. */
	readonly live: boolean;
	/** Log lines streamed by the run so far (real backend only). */
	readonly logs: readonly string[];
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
	const [logs, setLogs] = useState<readonly string[]>([]);
	// Decided once per mount: flipping the backend mid-run does not change the service that is already running.
	const [live] = useState(() => running && getBackendMode() === 'real');

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const result = await migration.getAnalysis(project);
				if (controller.signal.aborted) {
					return;
				}
				// A live run must not open with the previous run's findings; only the task list is kept.
				setAnalysis(live ? { ...result, logs: [], discovery: [], metrics: { filesScanned: 0, components: 0, risks: 0 }, blockers: '', artifacts: [], tasks: result.tasks.map(task => ({ ...task, doneMeta: '' })) } : result);
				if (running) {
					await migration.runAnalysis(
						project,
						value => setProgress(previous => Math.max(previous, value)),
						controller.signal,
						commentsRef.current,
						line => setLogs(previous => [...previous, line])
					);
					// The real backend only has the findings once the run is over; the mock returns the same result.
					const finished = await migration.getAnalysis(project);
					if (!controller.signal.aborted) {
						setAnalysis(finished);
					}
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Analysis failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running, live]);

	return { analysis, progress, complete: !!analysis && progress >= 1, error, live, logs };
}

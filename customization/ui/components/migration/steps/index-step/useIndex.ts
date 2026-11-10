'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IndexResult } from '@/features/migration/componentIndex';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

export interface IndexState {
	readonly index: IndexResult | undefined;
	/** 0..1; always 1 on the done screen. */
	readonly progress: number;
	readonly complete: boolean;
	/** Capability ids whose deep analysis is generated. */
	readonly analyzed: ReadonlySet<string>;
	/** Capability ids whose deep analysis is being generated. */
	readonly generating: ReadonlySet<string>;
	/** False until the saved analyses have been read. */
	readonly ready: boolean;
	readonly error: string | undefined;
	generate(capabilityId: string): Promise<void>;
	/** Discards generated analyses so a rebuild starts clean. */
	discard(): Promise<void>;
}

/**
 * Loads the component index and, on the running screen, builds it. Mount once per screen (key the component by screen);
 * the run is aborted on unmount, which is how Stop works.
 */
export function useIndex(project: Project, running: boolean): IndexState {
	const { migration } = useServices();
	const [index, setIndex] = useState<IndexResult>();
	const [analyzed, setAnalyzed] = useState<ReadonlySet<string>>(new Set());
	const [generating, setGenerating] = useState<ReadonlySet<string>>(new Set());
	const [ready, setReady] = useState(false);
	const [progress, setProgress] = useState(running ? 0 : 1);
	const [error, setError] = useState<string>();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const [result, saved] = await Promise.all([migration.getIndex(project), migration.getAnalyzedCapabilities(project)]);
				if (controller.signal.aborted) {
					return;
				}
				setIndex(result);
				setAnalyzed(new Set(saved));
				setReady(true);
				if (running) {
					await migration.runIndex(project, setProgress, controller.signal);
					setProgress(1);
				}
			} catch (e) {
				if (!controller.signal.aborted) {
					setError(e instanceof Error ? e.message : 'Indexing failed');
				}
			}
		})();
		return () => controller.abort();
	}, [migration, project, running]);

	const generate = useCallback(async (capabilityId: string) => {
		setGenerating(s => new Set(s).add(capabilityId));
		try {
			await migration.analyzeCapability(project, capabilityId);
			setAnalyzed(s => new Set(s).add(capabilityId));
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Deep analysis failed');
		} finally {
			setGenerating(s => {
				const next = new Set(s);
				next.delete(capabilityId);
				return next;
			});
		}
	}, [migration, project]);

	const discard = useCallback(async () => {
		await migration.clearAnalyzedCapabilities(project);
		setAnalyzed(new Set());
	}, [migration, project]);

	return { index, progress, complete: !!index && progress >= 1, analyzed, generating, ready, error, generate, discard };
}

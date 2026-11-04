'use client';

import { useEffect, useState } from 'react';
import { useWorkspace } from '@/components/useWorkspace';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

export type Detection =
	| { status: 'detecting' }
	/** No folder is open in the IDE, so there is nothing to scan. */
	| { status: 'noFolder' }
	| { status: 'done'; folders: readonly string[]; projects: readonly Project[] }
	| { status: 'failed'; error: string };

/** Detects the migration projects in the folders opened in the IDE. Re-runs when the folders change. */
export function useDetectedProjects(): Detection {
	const { projects } = useServices();
	const folders = useWorkspace();
	const [detection, setDetection] = useState<Detection>({ status: 'detecting' });
	const key = folders?.join('\n');

	useEffect(() => {
		if (!folders) {
			// The IDE reports the opened folders right after the page loads; keep waiting until it does.
			setDetection({ status: 'detecting' });
			return;
		}
		if (folders.length === 0) {
			setDetection({ status: 'noFolder' });
			return;
		}
		let cancelled = false;
		setDetection({ status: 'detecting' });
		projects.detectProjects(folders).then(
			found => !cancelled && setDetection({ status: 'done', folders, projects: found }),
			error => !cancelled && setDetection({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
		);
		return () => { cancelled = true; };
		// `folders` is compared by content through `key`
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projects, key]);

	return detection;
}

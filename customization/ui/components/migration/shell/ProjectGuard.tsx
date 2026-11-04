'use client';

import { useEffect } from 'react';
import { useNavigate } from '@/state/useNavigate';
import { useMigration } from '@/state/MigrationProvider';
import type { Project } from '@/features/migration/types';

/** Renders `children` with the active project; sends the user back to the launcher when there is none. */
export function ProjectGuard({ children }: { children: (project: Project) => React.ReactNode }) {
	const { hydrated, project } = useMigration();
	const navigate = useNavigate();

	useEffect(() => {
		if (hydrated && !project) {
			navigate.studio();
		}
	}, [hydrated, project, navigate]);

	return project ? <>{children(project)}</> : null;
}

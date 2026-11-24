'use client';

import { useEffect, useState } from 'react';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { SCREENS } from '@/features/migration/steps';
import { consumeCreateProjectRequest, onCreateProjectRequest } from '@/lib/studioIntent';
import { useMigration } from '@/state/MigrationProvider';
import { useNavigate } from '@/state/useNavigate';
import { useDetectedProjects } from '@/state/useDetectedProjects';
import { DetectionFailed } from './DetectionFailed';
import { NoFolder } from './NoFolder';
import { SelectProject } from './SelectProject';
import { Welcome } from './Welcome';

/**
 * Entry of the studio (center panel). Detects the projects of the opened folder and decides the view:
 * several -> select one, none -> intro page, then create one, one -> open it straight away. An already active project is resumed.
 */
export function StudioEntry() {
	const detection = useDetectedProjects();
	const { hydrated, project, reached, selectProject, openProject, resumeScreen } = useMigration();
	const navigate = useNavigate();
	const [creating, setCreating] = useState(false);

	// The sidebar's "Create New Project" button asks for the form, whether this tab was already open or just opened.
	useEffect(() => {
		if (consumeCreateProjectRequest()) {
			setCreating(true);
		}
		return onCreateProjectRequest(() => setCreating(true));
	}, []);

	const single = detection.status === 'done' && detection.projects.length === 1 ? detection.projects[0] : undefined;
	const ready = hydrated && (detection.status === 'done' || detection.status === 'noFolder');

	useEffect(() => {
		if (!ready) {
			return;
		}
		if (project) {
			navigate.screen(SCREENS[reached]?.key ?? 'ready'); // resume where the user left off
		} else if (single) {
			selectProject(single);
			navigate.screen(resumeScreen(single));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ready]);

	if (detection.status === 'failed') {
		return <DetectionFailed error={detection.error} />;
	}
	if (detection.status === 'noFolder') {
		return <NoFolder />;
	}
	if (!ready || project || single || detection.status !== 'done') {
		return <p className="p-space-lg text-body-sm text-outline">Detecting projects…</p>;
	}
	if (detection.projects.length === 0) {
		return creating
			? <NewProjectForm folder={detection.folders[0]} onCreated={openProject} onCancel={() => setCreating(false)} />
			: <Welcome onNewProject={() => setCreating(true)} />;
	}
	return <SelectProject projects={detection.projects} onSelect={openProject} />;
}

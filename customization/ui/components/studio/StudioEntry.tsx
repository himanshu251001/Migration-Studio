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

const ASKED_KEY = 'migration-studio-project-asked';

/** Whether the project choice was already asked since the app was opened (survives navigation, not an app restart). */
function wasAsked(): boolean {
	try {
		return sessionStorage.getItem(ASKED_KEY) === '1';
	} catch {
		return false;
	}
}

function markAsked(): void {
	try {
		sessionStorage.setItem(ASKED_KEY, '1');
	} catch {
		// storage unavailable: ask again next time
	}
}

/**
 * Entry of the studio (center panel). Detects the projects of the opened folder and decides the view:
 * several -> select one when the app is opened (a project from a previous launch is not resumed, but navigating back within the same launch resumes it), none -> intro page, then create one, one -> open it straight away. An already active project is resumed.
 */
export function StudioEntry() {
	const detection = useDetectedProjects();
	const { hydrated, project, reached, selectProject, openProject, resumeScreen, clear } = useMigration();
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
	const multiple = detection.status === 'done' && detection.projects.length > 1;
	const ready = hydrated && (detection.status === 'done' || detection.status === 'noFolder');

	const resumable = multiple && !!project && wasAsked() && detection.projects.some(candidate => candidate.id === project.id);

	useEffect(() => {
		if (!ready) {
			return;
		}
		if (detection.status === 'done' && detection.projects.length > 1) {
			if (resumable && project) {
				navigate.screen(SCREENS[reached]?.key ?? 'ready'); // navigated back within the same launch: keep the chosen project
			} else {
				markAsked();
				clear(); // several projects, app just opened: ask which one
			}
		} else if (single) {
			if (project?.id === single.id) {
				navigate.screen(SCREENS[reached]?.key ?? 'ready'); // resume where the user left off
			} else {
				selectProject(single);
				navigate.screen(resumeScreen(single));
			}
		} else if (project) {
			clear(); // no project in this folder (or no folder): the stored one belongs to another folder
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ready]);

	if (detection.status === 'failed') {
		return <DetectionFailed error={detection.error} />;
	}
	if (detection.status === 'noFolder') {
		return <NoFolder />;
	}
	if (!ready || (project && (!multiple || resumable)) || single || detection.status !== 'done') {
		return <p className="p-space-lg text-body-sm text-outline">Detecting projects…</p>;
	}
	if (detection.projects.length === 0) {
		return creating
			? <NewProjectForm folder={detection.folders[0]} onCreated={openProject} onCancel={() => setCreating(false)} />
			: <Welcome onNewProject={() => setCreating(true)} />;
	}
	return <SelectProject projects={detection.projects} onSelect={openProject} />;
}

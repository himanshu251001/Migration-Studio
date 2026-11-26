'use client';

import { useEffect } from 'react';
import { Button, Icon } from '@/components/ui';
import { DetectionFailed } from '@/components/studio/DetectionFailed';
import { NoFolder } from '@/components/studio/NoFolder';
import type { Project } from '@/features/migration/types';
import { requestCreateProject } from '@/lib/studioIntent';
import { useMigration } from '@/state/MigrationProvider';
import { useNavigate } from '@/state/useNavigate';
import { useDetectedProjects } from '@/state/useDetectedProjects';

/** The studio opens itself in the center panel once per sidebar session (not again after the user closes it). */
let autoOpened = false;

/**
 * Narrow sidebar view. Detects the projects of the opened folder, opens the studio in the center panel
 * (which shows the select / create / project view) and lists the active project's Source and Destination folders.
 */
export function Launcher() {
	const detection = useDetectedProjects();
	const { hydrated, project, selectProject, clear, resumeScreen } = useMigration();
	const navigate = useNavigate();

	const detected = detection.status === 'done' ? detection.projects : undefined;

	// A project restored from storage must not skip this, otherwise the user has to click "Open Migration Studio".
	useEffect(() => {
		if (!hydrated || !detected) {
			return;
		}
		if (!project && detected.length === 1) {
			selectProject(detected[0]);
		}
		if (!autoOpened) {
			autoOpened = true;
			navigate.studio();
		}
	}, [hydrated, detected, project, selectProject, navigate]);

	const open = (active: Project | undefined, count: number) => {
		if (active) {
			navigate.screen(resumeScreen(active));
		} else {
			if (count === 0) {
				requestCreateProject();
			}
			navigate.studio();
		}
	};

	if (detection.status === 'noFolder') {
		return <main className="p-space-md"><NoFolder compact /></main>;
	}
	if (detection.status === 'failed') {
		return <main className="p-space-md"><DetectionFailed error={detection.error} /></main>;
	}
	if (!hydrated || !detected) {
		return <p className="p-space-md text-body-sm text-outline">Detecting projects…</p>;
	}

	return (
		<main className="p-space-md space-y-space-md">
			{project ? (
				<ProjectFolders project={project} canSwitch={detected.length > 1} onSwitch={() => { clear(); navigate.studio(); }} />
			) : (
				<Detection count={detected.length} />
			)}
			<Button variant="primary" className="w-full" icon="open_in_new" onClick={() => open(project, detected.length)}>
				{project ? 'Open Migration Studio' : detected.length === 0 ? 'Create New Project' : 'Select Project'}
			</Button>
			<Button variant="ghost" className="w-full" icon="tune" onClick={navigate.settings}>Settings</Button>
		</main>
	);
}

function Detection({ count }: { count: number }) {
	return (
		<div className="space-y-space-xs">
			<h1 className="font-headline-sm text-headline-sm">{count === 0 ? 'No project detected' : `${count} projects detected`}</h1>
			<p className="text-body-sm text-on-surface-variant">
				{count === 0 ? 'Create a migration project in the main panel to get started.' : 'Select the project to work on in the main panel.'}
			</p>
		</div>
	);
}

function ProjectFolders({ project, canSwitch, onSwitch }: { project: Project; canSwitch: boolean; onSwitch: () => void }) {
	return (
		<div className="space-y-space-sm">
			<div>
				<div className="text-label-sm font-label-sm uppercase tracking-wider text-outline">Project</div>
				<h1 className="font-headline-sm text-headline-sm truncate">{project.name}</h1>
			</div>
			<Folder label="Source" icon="folder" tone="text-secondary" path={project.source} />
			<Folder label="Destination" icon="folder_special" tone="text-tertiary" path={project.dest} />
			{canSwitch && <Button variant="ghost" className="w-full" icon="swap_horiz" onClick={onSwitch}>Change Project</Button>}
		</div>
	);
}

function Folder({ label, icon, tone, path }: { label: string; icon: string; tone: string; path: string }) {
	return (
		<div className="flex items-start gap-space-sm p-space-sm rounded-lg bg-surface-container-low border border-outline-variant/40">
			<Icon name={icon} className={`text-[18px] mt-0.5 ${tone}`} />
			<div className="min-w-0">
				<div className="text-label-sm font-label-sm uppercase tracking-wider text-outline">{label}</div>
				<div className="text-label-md font-label-md break-all" title={path}>{path}</div>
			</div>
		</div>
	);
}

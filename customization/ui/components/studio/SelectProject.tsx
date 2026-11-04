'use client';

import { useState } from 'react';
import { Button, Icon } from '@/components/ui';
import type { Project } from '@/features/migration/types';

/** Center-panel screen shown when several projects are detected: pick the one to work on. */
export function SelectProject({ projects, onSelect }: { projects: readonly Project[]; onSelect: (project: Project) => void }) {
	const [selected, setSelected] = useState(projects[0].id);
	const chosen = projects.find(p => p.id === selected) ?? projects[0];

	return (
		<div className="min-h-full flex items-center justify-center p-space-lg">
			<div className="w-full max-w-2xl py-space-xl flex flex-col">
				<div className="flex justify-center mb-space-lg text-secondary">
					<Icon name="folder_open" className="text-[56px]" />
				</div>
				<div className="text-center mb-space-xl">
					<h1 className="text-headline-lg font-headline-lg mb-1.5">Multiple projects detected</h1>
					<p className="text-body-md font-body-md text-on-surface-variant max-w-sm mx-auto">
						We found {projects.length} migration projects in this folder. Select the project you want to work on.
					</p>
				</div>

				<div role="radiogroup" aria-label="Detected projects" className="space-y-space-sm">
					{projects.map(p => <ProjectRow key={p.id} project={p} on={p.id === selected} onSelect={() => setSelected(p.id)} />)}
				</div>

				<div className="mt-space-xl pt-space-md flex flex-wrap items-center justify-between gap-space-md border-t border-outline-variant/40">
					<span className="text-label-sm font-label-sm text-outline">{chosen.name} will be opened in Migration Studio.</span>
					<Button variant="primary" onClick={() => onSelect(chosen)}>Open Selected Project</Button>
				</div>
			</div>
		</div>
	);
}

function ProjectRow({ project, on, onSelect }: { project: Project; on: boolean; onSelect: () => void }) {
	return (
		<div
			role="radio"
			aria-checked={on}
			tabIndex={0}
			onClick={onSelect}
			onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect()}
			className={`flex items-center justify-between gap-space-md p-space-md rounded-xl border cursor-pointer transition-colors ${on ? 'bg-primary-container/10 border-primary ring-1 ring-primary/30' : 'bg-surface-container-low border-outline-variant/40 hover:bg-surface-container hover:border-outline-variant'}`}
		>
			<div className="flex items-start gap-space-md min-w-0">
				<div className={`p-2 rounded-lg shrink-0 ${on ? 'bg-primary-container/20 text-primary' : 'bg-surface-container-high text-outline'}`}>
					<Icon name="folder" className="text-[20px]" />
				</div>
				<div className="min-w-0 space-y-0.5">
					<div className="text-body-md font-body-md font-semibold truncate">{project.name}</div>
					<div className="text-label-md font-label-md text-outline truncate">Source: {project.source}</div>
					<div className="text-label-md font-label-md text-outline truncate">Destination: {project.dest}</div>
				</div>
			</div>
			{on
				? <div className="w-5 h-5 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container shrink-0"><Icon name="check" className="text-[14px]" /></div>
				: <div className="w-5 h-5 rounded-full border border-outline-variant shrink-0" />}
		</div>
	);
}

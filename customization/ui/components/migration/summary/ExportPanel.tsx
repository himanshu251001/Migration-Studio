'use client';

import { Button, Icon, Panel } from '@/components/ui';
import type { BacklogMilestone } from '@/features/migration/stories';
import { useServices } from '@/services/ServiceProvider';
import type { Project } from '@/features/migration/types';
import { FIELD } from './fields';

export const BACKLOG_FILE = 'MIGRATION-BACKLOG.md';

type ExportState =
	| { kind: 'idle' }
	| { kind: 'saving' }
	| { kind: 'done'; path: string }
	| { kind: 'error'; message: string };

/** Destination folder and export action. The parent owns the export action so the banner button can share it. */
export function ExportPanel({ project, plan, dest, onDestChange, state, onExport }: {
	project: Project;
	plan: readonly BacklogMilestone[];
	dest: string;
	onDestChange: (dest: string) => void;
	state: ExportState;
	onExport: () => void;
}) {
	const stories = plan.reduce((n, m) => n + m.stories.length, 0);
	const tasks = plan.reduce((n, m) => n + m.stories.reduce((t, s) => t + s.tasks.length, 0), 0);

	return (
		<Panel icon="folder_open" iconClass="text-secondary" title={`${plan.length} milestones, ${stories} stories and ${tasks} tasks are ready to export.`}>
			<label className="block space-y-space-xs">
				<span className="block font-code-snippet text-code-snippet text-on-surface-variant">Destination folder</span>
				<input aria-label="Destination folder" className={`${FIELD} font-code-snippet`} value={dest} onChange={e => onDestChange(e.target.value)} />
			</label>
			<p className="text-body-sm font-body-sm text-on-surface-variant">Writes {BACKLOG_FILE} into a "migration" folder inside the destination. The folder is created if its parent exists.</p>
			<div className="flex flex-wrap gap-space-sm">
				<Button variant="primary" icon="download" disabled={state.kind === 'saving' || plan.length === 0 || !dest.trim()} onClick={onExport}>{state.kind === 'saving' ? 'Exporting...' : 'Export plan to destination'}</Button>
			</div>
			{state.kind === 'done' && (
				<div className="rounded-lg bg-tertiary/10 p-space-sm space-y-0.5 text-body-sm font-body-sm text-tertiary">
					<div className="flex items-center gap-space-xs font-medium"><Icon name="check_circle" className="text-[16px]" /> Exported {stories} stories and {tasks} tasks.</div>
					<div className="break-all font-code-snippet text-code-snippet">{state.path}</div>
				</div>
			)}
			{state.kind === 'error' && (
				<div className="flex items-start gap-space-xs rounded-lg bg-error-container/20 p-space-sm text-body-sm font-body-sm text-error"><Icon name="error" className="text-[16px] shrink-0" /> {state.message}</div>
			)}
		</Panel>
	);
}

export type { ExportState };

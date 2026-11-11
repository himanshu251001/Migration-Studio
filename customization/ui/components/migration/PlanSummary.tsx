'use client';

import { useState } from 'react';
import { Button, Icon, Modal, Panel } from '@/components/ui';
import { STEP_DEFS } from '@/features/migration/steps';
import { countBacklog, toBacklogMarkdown } from '@/features/migration/stories';
import type { Project } from '@/features/migration/types';
import { isEmbedded, postToHost } from '@/lib/hostBridge';
import { useServices } from '@/services/ServiceProvider';
import { useMigration } from '@/state/MigrationProvider';
import { BACKLOG_FILE, ExportPanel, type ExportState } from './summary/ExportPanel';
import { TrackerPanel } from './summary/TrackerPanel';
import { useStories } from './steps/stories/useStories';

/** The finished plan: sign-off banner, export to a folder, push to an issue tracker, and a way to close the migration. */
export function PlanSummary({ project }: { project: Project }) {
	const { artifacts } = useServices();
	const { exit } = useMigration();
	const { plan, ready, error } = useStories(project, false);
	const [dest, setDest] = useState(project.dest);
	const [exported, setExported] = useState<ExportState>({ kind: 'idle' });
	const [pushed, setPushed] = useState(false);
	const [confirmClose, setConfirmClose] = useState(false);
	const { stories, tasks } = countBacklog(plan);
	const handedOver = exported.kind === 'done' || pushed;

	const exportPlan = async () => {
		setExported({ kind: 'saving' });
		try {
			const path = await artifacts.exportPlan(dest.trim(), BACKLOG_FILE, toBacklogMarkdown(project.name, plan));
			setExported({ kind: 'done', path });
			if (isEmbedded()) {
				postToHost({ v: 1, type: 'openFile', payload: { path, preview: true } });
			}
		} catch (e) {
			setExported({ kind: 'error', message: e instanceof Error ? e.message : 'Export failed.' });
		}
	};

	if (error) {
		return <Panel icon="error" iconClass="text-error" title="Plan summary unavailable"><p className="text-body-md font-body-md text-on-surface-variant">{error}</p></Panel>;
	}
	if (!ready) {
		return (
			<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
				<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading plan...
			</div>
		);
	}
	return (
		<div className="space-y-space-lg">
			<div className="bg-surface-container border border-outline-variant/40 rounded-xl p-space-md space-y-space-md">
				<div className="flex items-start gap-space-md">
					<div className="size-12 rounded-full bg-tertiary/15 flex items-center justify-center shrink-0"><Icon name="check" className="text-[24px] text-tertiary" /></div>
					<div>
						<div className="text-headline-sm font-headline-sm">Transformation plan complete</div>
						<div className="text-body-sm font-body-sm text-on-surface-variant">All {STEP_DEFS.length} steps signed off for {project.name}: {STEP_DEFS.map(s => s.short.toLowerCase()).join(', ')}. Export the stories and tasks to the destination folder to hand them over.</div>
					</div>
				</div>
				<div className="flex flex-wrap gap-space-sm">
					<Button icon="close" onClick={() => (handedOver ? exit() : setConfirmClose(true))}>Finish &amp; Close Migration</Button>
					<Button variant="primary" icon="download" disabled={exported.kind === 'saving' || plan.length === 0 || !dest.trim()} onClick={() => void exportPlan()}>Export plan to destination</Button>
				</div>
			</div>
			<ExportPanel project={project} plan={plan} dest={dest} onDestChange={setDest} state={exported} onExport={() => void exportPlan()} />
			<TrackerPanel plan={plan} onPushed={() => setPushed(true)} />
			{confirmClose && (
				<Modal title="Close without exporting?" onClose={() => setConfirmClose(false)}>
					<p className="text-body-md font-body-md text-on-surface-variant">You haven't exported or pushed the plan yet. Closing clears this migration's progress ({stories} stories, {tasks} tasks).</p>
					<div className="flex justify-end gap-space-sm pt-space-md">
						<Button onClick={() => setConfirmClose(false)}>Keep Working</Button>
						<Button variant="primary" onClick={exit}>Close Anyway</Button>
					</div>
				</Modal>
			)}
		</div>
	);
}

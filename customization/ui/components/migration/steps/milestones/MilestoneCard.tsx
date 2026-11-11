'use client';

import { useState } from 'react';
import { Badge, Button, Icon } from '@/components/ui';
import type { Milestone } from '@/features/migration/milestones';
import type { DeepAnalysis } from './useMilestones';

const FIELD = 'rounded border border-outline-variant/40 bg-surface-container-low px-space-sm py-1 text-body-md font-body-md text-on-surface outline-none focus:border-primary';

/** One milestone: editable name while the plan is a draft, optional deep analysis once it is locked. */
export function MilestoneCard({ milestone, name, locked, analysis, logs, onRename, onAnalyze, onStop }: {
	milestone: Milestone;
	name: string;
	locked: boolean;
	analysis: DeepAnalysis;
	/** Report lines of the deep analysis, already filled in for this milestone. */
	logs: readonly string[];
	onRename: (name: string) => void;
	onAnalyze: () => void;
	onStop: () => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(name);
	return (
		<div className="rounded-xl border border-outline-variant/30 bg-surface-container-low">
			<div className="flex items-start justify-between gap-space-sm p-space-md">
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-space-sm">
						{editing
							? <input autoFocus aria-label={`Name of ${milestone.id}`} value={draft} onChange={e => setDraft(e.target.value)} className={FIELD} />
							: <span className="text-headline-sm font-headline-sm break-words">{milestone.id} · {name}</span>}
						{!locked && <Badge className="bg-surface-container-highest text-on-surface-variant">Draft</Badge>}
					</div>
					<div className="text-label-md font-label-md text-on-surface-variant">Covers {milestone.covers}</div>
					{!locked && (editing
						? (
							<div className="flex gap-space-xs pt-1">
								<Button disabled={!draft.trim()} onClick={() => { onRename(draft.trim()); setEditing(false); }}>Save</Button>
								<Button onClick={() => { setDraft(name); setEditing(false); }}>Cancel</Button>
							</div>
						)
						: <Button icon="edit" onClick={() => { setDraft(name); setEditing(true); }}>Edit</Button>)}
				</div>
				<Badge className="bg-surface-container-highest text-primary shrink-0">{milestone.size}</Badge>
			</div>
			{locked && (
				<div className="border-t border-outline-variant/30 p-space-md space-y-space-sm">
					{analysis.state === 'idle' && <Button variant="primary" onClick={onAnalyze}>Generate Deep Analysis</Button>}
					{analysis.state === 'running' && (
						<div className="rounded-lg border border-outline-variant/30 bg-surface-container">
							<div className="flex items-center justify-between gap-space-sm p-space-sm text-body-md font-body-md">
								<span className="flex items-center gap-space-sm"><Icon name="progress_activity" className="text-[18px] animate-spin text-primary" /> Deep-analyzing {milestone.id}...</span>
								<Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop</Button>
							</div>
							<div className="border-t border-outline-variant/30 p-space-sm text-label-md font-label-md text-on-surface-variant">{logs[0]}</div>
						</div>
					)}
					{analysis.state === 'done' && (
						<>
							<div className="flex flex-wrap items-center gap-space-sm">
								<Button onClick={onAnalyze}>Regenerate Deep Analysis</Button>
								<span className="text-label-md font-label-md text-on-surface-variant" suppressHydrationWarning>Last generated {analysis.at?.toLocaleString()}</span>
							</div>
							<ul className="rounded-lg border border-outline-variant/30 bg-surface-container p-space-sm space-y-space-xs text-body-md font-body-md">
								{logs.map(l => (
									<li key={l} className="flex items-start gap-space-sm"><Icon name="check" className="text-[18px] text-tertiary" /> {l}</li>
								))}
							</ul>
						</>
					)}
				</div>
			)}
		</div>
	);
}

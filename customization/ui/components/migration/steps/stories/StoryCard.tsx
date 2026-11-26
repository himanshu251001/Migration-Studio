'use client';

import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import type { Story } from '@/features/migration/stories';

/** The line that says a legacy defect is not carried forward; shown as a warning. */
const DEFECT_CRITERION = /do[- ]not[- ]carry[- ]forward|does not reproduce/i;

/** One story with its acceptance criteria and tasks. The last criterion is a "do not carry forward" warning. */
export function StoryCard({ story, busy, onRegenerate }: { story: Story; busy: boolean; onRegenerate: () => void }) {
	const [open, setOpen] = useState(true);
	return (
		<div className="rounded-lg border border-outline-variant/30 bg-surface-container">
			<div className="flex items-start justify-between gap-space-sm p-space-sm">
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-space-sm">
						<span className="text-body-md font-body-md font-medium break-words">{story.id} · {story.title}</span>
						<Badge className="bg-surface-container-highest text-on-surface-variant">{story.size}</Badge>
					</div>
					<p className="text-label-md font-label-md text-on-surface-variant">{story.text}</p>
				</div>
				<Button variant="ghost" icon={open ? 'expand_less' : 'expand_more'} aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide Tasks' : 'Show Tasks'}</Button>
			</div>
			{open && (
				<div className="border-t border-outline-variant/30 p-space-sm space-y-space-sm">
					<div className="text-label-md font-label-md text-on-surface-variant">Acceptance Criteria</div>
					<ul className="space-y-1 text-body-sm font-body-sm">
						{story.criteria.map(c => <li key={c} className={DEFECT_CRITERION.test(c) ? 'text-secondary' : ''}>☐ {c}</li>)}
					</ul>
					<div className="text-label-md font-label-md text-on-surface-variant">Tasks</div>
					<ol className="list-decimal space-y-1 pl-space-md text-body-sm font-body-sm">
						{story.tasks.map(t => <li key={t}>{t}</li>)}
					</ol>
					<Button disabled={busy} onClick={onRegenerate}>{busy ? 'Generating...' : 'Regenerate Tasks'}</Button>
				</div>
			)}
		</div>
	);
}

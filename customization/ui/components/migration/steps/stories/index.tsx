'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Icon, Metric, Panel, ProgressBar, TaskList } from '@/components/ui';
import { countBacklog, type StoriesResult } from '@/features/migration/stories';
import { useMigration } from '@/state/MigrationProvider';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import type { StepViewProps } from '../types';
import { StoryCard } from './StoryCard';
import { useStories, type StoriesState } from './useStories';

const STEP_INDEX = 9;
const ADVANCE_DELAY_MS = 700;

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading stories...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Story breakdown failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 10: writes user stories and tasks for every milestone (running screen), then lets the reviewer browse and regenerate them (done screen). */
export function StoriesStep({ project, kind, onGate }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const state = useStories(project, running);
	const { result, progress, complete, busy, ready, error } = state;

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('stories-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// Next stays locked while a generation is in flight, so the summary never shows a half-written backlog.
	useEffect(() => onGate(running || (ready && busy.length === 0)), [onGate, running, ready, busy.length]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!result || !ready) {
		return <Loading />;
	}
	return running
		? <Running result={result} state={state} progress={progress} complete={complete} onStop={() => go('ready')} />
		: <Done result={result} state={state} onRerun={() => go('stories')} />;
}

function Running({ result, state, progress, complete, onStop }: { result: StoriesResult; state: StoriesState; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? result.logs.length : Math.max(1, Math.ceil(progress * result.logs.length));
	const { stories, tasks } = countBacklog(state.plan);
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Break down stories and tasks"
				description="Split each milestone into user stories and atomic tasks ready for a team to pick up."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Backlog writer idle' : 'Backlog writer active'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Breakdown</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Backlog Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(result.tasks, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
						<Metric icon="article" value={Math.round(progress * stories)} label="Stories" />
						<Metric icon="task_alt" value={Math.round(progress * tasks)} label="Tasks" tone="secondary" />
					</div>
					<Panel icon="terminal" iconClass="text-secondary" title="Backlog Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{result.logs.slice(0, shownLogs).map(l => <li key={l} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

function Done({ result, state, onRerun }: { result: StoriesResult; state: StoriesState; onRerun: () => void }) {
	const { plan, busy, regenerate } = state;
	const [hidden, setHidden] = useState<readonly string[]>([]);
	const { stories, tasks } = countBacklog(plan);
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Stories and Tasks Ready"
				description={`${stories} stories and ${tasks} atomic tasks were written. Browse them per milestone, then continue to the plan summary.`}
				badge={<Badge className="bg-tertiary/15 text-tertiary">{`Backlog ready (${result.duration}) · ${tasks} tasks`}</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Re-run Breakdown</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="article" title="Stories and Tasks">
						<div className="grid grid-cols-3 gap-space-sm">
							<Metric icon="event_note" value={plan.length} label="Milestones" />
							<Metric icon="article" value={stories} label="Stories" tone="secondary" />
							<Metric icon="task_alt" value={tasks} label="Tasks" tone="tertiary" />
						</div>
						<p className="text-body-md font-body-md text-on-surface-variant">Each milestone has its user stories, acceptance criteria and tasks. Regenerate a milestone or the tasks of one story if they need another pass.</p>
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-sm">
					{plan.map(m => {
						const closed = hidden.includes(m.id);
						const working = busy.includes(m.id);
						return (
							<div key={m.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-low">
								<div className="space-y-space-sm p-space-md">
									<div className="flex items-start justify-between gap-space-sm">
										<div className="min-w-0">
											<div className="text-headline-sm font-headline-sm break-words">{m.id} · {m.name}</div>
											<div className="text-label-md font-label-md text-on-surface-variant">{m.stories.length} stories</div>
										</div>
										<Button variant="ghost" icon={closed ? 'expand_more' : 'expand_less'} aria-expanded={!closed} onClick={() => setHidden(h => closed ? h.filter(x => x !== m.id) : [...h, m.id])}>{closed ? 'Show Stories' : 'Hide Stories'}</Button>
									</div>
									<Button disabled={working} onClick={() => regenerate(m.id)}>{working ? 'Generating...' : 'Re-run Stories and Tasks Pipeline'}</Button>
								</div>
								{!closed && (
									<div className="space-y-space-sm border-t border-outline-variant/30 p-space-md">
										{m.stories.map(s => <StoryCard key={s.id} story={s} busy={working || busy.includes(s.id)} onRegenerate={() => regenerate(m.id, s.id)} />)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</>
	);
}

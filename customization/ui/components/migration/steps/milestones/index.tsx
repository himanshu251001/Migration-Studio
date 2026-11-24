'use client';

import { useEffect } from 'react';
import { Badge, Button, Icon, Metric, Panel, ProgressBar, TaskList } from '@/components/ui';
import type { MilestonesResult } from '@/features/migration/milestones';
import { useMigration } from '@/state/MigrationProvider';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import type { StepViewProps } from '../types';
import { MilestoneCard } from './MilestoneCard';
import { useMilestones, type MilestonesState } from './useMilestones';

const STEP_INDEX = 8;
const ADVANCE_DELAY_MS = 700;

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading milestones...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Milestone scheduling failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 9: schedules the migration into milestones (running screen), then lets the reviewer edit and lock the plan (done screen). */
export function MilestonesStep({ project, kind, onGate }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const state = useMilestones(project, running);
	const { milestones, progress, complete, decision, ready, error } = state;

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('milestones-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// Next stays locked until the reviewer has locked the milestone plan.
	useEffect(() => onGate(running || (ready && decision.locked)), [onGate, running, ready, decision.locked]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!milestones || !ready) {
		return <Loading />;
	}
	return running
		? <Running result={milestones} progress={progress} complete={complete} onStop={() => go('ready')} />
		: <Done result={milestones} state={state} onRerun={async () => { await state.discard(); go('milestones'); }} />;
}

function Running({ result, progress, complete, onStop }: { result: MilestonesResult; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? result.logs.length : Math.max(1, Math.ceil(progress * result.logs.length));
	const total = result.milestones.length;
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Set milestones"
				description="Turn the execution order and rollout plan into milestones with exit criteria."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Scheduler idle' : 'Scheduler active'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Scheduling</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Milestone Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(result.tasks, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
						<Metric icon="event_note" value={Math.round(progress * total)} label="Milestones" />
						<Metric icon="timer" value={`${Math.round(progress * 100)}%`} label="Scheduled" tone="secondary" />
					</div>
					<Panel icon="terminal" iconClass="text-secondary" title="Scheduler Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{result.logs.slice(0, shownLogs).map((l, i) => <li key={`${i}-${l}`} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

function Done({ result, state, onRerun }: { result: MilestonesResult; state: MilestonesState; onRerun: () => void }) {
	const { decision, analysis, nameOf, rename, lock, analyze, stopAnalysis } = state;
	const locked = decision.locked;
	const total = result.milestones.length;
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Milestones Set"
				description="Review and edit the drafted milestones, then lock the plan to continue."
				badge={<Badge className={locked ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{locked ? 'Milestone plan locked' : `Awaiting your review (${result.duration})`}</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Re-plan Milestones</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon={locked ? 'check_circle' : 'lock_open'} iconClass={locked ? 'text-tertiary' : 'text-secondary'} title="Milestones" badge={<Badge className={locked ? 'bg-tertiary/15 text-tertiary' : 'bg-surface-container-highest text-on-surface-variant'}>{locked ? 'Locked' : 'Draft'}</Badge>}>
						<div className="grid grid-cols-3 gap-space-sm">
							<Metric icon="list" value={total} label="Total" />
							<Metric icon="lock" value={locked ? total : 0} label="Locked" tone="tertiary" />
							<Metric icon="edit_note" value={locked ? 0 : total} label="Draft" tone="secondary" />
						</div>
						<hr className="border-outline-variant/40" />
						<div className="text-label-sm font-label-sm uppercase text-outline">Plan</div>
						<ul className="space-y-space-xs">
							{result.milestones.map(m => (
								<li key={m.id} className="flex items-center gap-space-sm text-body-md font-body-md">
									<span className="w-12 shrink-0 text-label-md font-label-md text-outline">{m.id}</span>
									<span className="flex-1 min-w-0 truncate">{nameOf(m.id, m.name)}</span>
									<Badge className="bg-surface-container-highest text-primary">{m.size}</Badge>
								</li>
							))}
						</ul>
						{locked
							? <p className="text-body-md font-body-md text-on-surface-variant">Milestone plan is locked. Deep analysis for each milestone is optional; continue whenever you are ready.</p>
							: (
								<>
									<p className="text-body-md font-body-md text-on-surface-variant">Each locked milestone can then be deep-analyzed.</p>
									<Button variant="primary" onClick={() => void lock()}>Lock Milestone Plan</Button>
								</>
							)}
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-sm">
					{result.milestones.map(m => {
						const name = nameOf(m.id, m.name);
						return (
							<MilestoneCard
								key={m.id}
								milestone={m}
								name={name}
								locked={locked}
								analysis={analysis[m.id] ?? { state: 'idle' }}
								logs={result.analysisLogs.map(l => l.replace('{name}', name))}
								onRename={n => rename(m.id, n)}
								onAnalyze={() => analyze(m.id)}
								onStop={() => stopAnalysis(m.id)}
							/>
						);
					})}
				</div>
			</div>
		</>
	);
}

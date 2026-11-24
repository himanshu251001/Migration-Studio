'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Icon, Metric, Panel, ProgressBar, TaskList } from '@/components/ui';
import type { RolloutResult } from '@/features/migration/rollout';
import { useMigration } from '@/state/MigrationProvider';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import type { StepViewProps } from '../types';
import { CardModal } from './CardModal';
import { useRollout, type RolloutState } from './useRollout';

const STEP_INDEX = 7;
const ADVANCE_DELAY_MS = 700;

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading rollout...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Rollout planning failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 8: plans how migrated units reach users (running screen), then lets the reviewer lock the strategy (done screen). */
export function RolloutStep({ project, kind, onGate }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const state = useRollout(project, running);
	const { rollout, progress, complete, locked, ready, error } = state;

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('rollout-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// Next stays locked until the reviewer has locked the migration strategy.
	useEffect(() => onGate(running || (ready && locked)), [onGate, running, ready, locked]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!rollout || !ready) {
		return <Loading />;
	}
	return running
		? <Running rollout={rollout} progress={progress} complete={complete} onStop={() => go('ready')} />
		: <Done rollout={rollout} state={state} onRerun={async () => { await state.discard(); go('rollout'); }} />;
}

function Running({ rollout, progress, complete, onStop }: { rollout: RolloutResult; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? rollout.logs.length : Math.max(1, Math.ceil(progress * rollout.logs.length));
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Plan the rollout"
				description="Decide how migrated units reach users: routing, feature flags, data sync and rollback."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Planner idle' : 'Planner active'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Planning</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Rollout Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(rollout.tasks, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<Panel icon="rocket_launch" iconClass="text-secondary" title="Rollout Draft">
						<ProgressBar pct={progress * 100} />
						<p className="text-body-md font-body-md text-on-surface-variant">Designing the routing, flag and cut-over plan for each unit.</p>
					</Panel>
					<Panel icon="terminal" iconClass="text-secondary" title="Planner Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{rollout.logs.slice(0, shownLogs).map((l, i) => <li key={`${i}-${l}`} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

function Done({ rollout, state, onRerun }: { rollout: RolloutResult; state: RolloutState; onRerun: () => void }) {
	const { locked, lock } = state;
	const [open, setOpen] = useState<number>();
	const card = open === undefined ? undefined : rollout.cards[open];
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Rollout Plan Ready"
				description="Review the strategy cards, then lock the migration strategy to continue."
				badge={<Badge className={locked ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{locked ? 'Strategy locked' : `Awaiting your confirmation (${rollout.duration})`}</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Re-plan Rollout</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel
						icon="rocket_launch"
						iconClass="text-secondary"
						title="Executive Summary"
						badge={<Button variant="primary" disabled={locked} onClick={() => void lock()}>{locked ? 'Strategy Locked' : 'Lock Migration Strategy'}</Button>}
					>
						<div className="grid grid-cols-2 gap-space-sm">
							<Metric icon="view_module" value={rollout.modules} label="Modules" />
							<Metric icon="waves" value={rollout.waves} label="Waves" />
							<Metric icon="gavel" value={rollout.decisions} label="Decisions" />
							<Metric icon="pending" value={rollout.attention.length} label="Open items" tone="secondary" />
						</div>
						<div className="rounded-lg border border-secondary/40 bg-secondary-container/20 p-space-sm space-y-space-xs">
							<div className="text-label-md font-label-md uppercase text-secondary">Needs attention</div>
							<ul className="list-disc pl-space-md space-y-1 text-body-md font-body-md text-secondary">
								{rollout.attention.map(a => <li key={a}>{a}</li>)}
							</ul>
						</div>
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-sm">
					<p className="text-label-sm font-label-sm text-on-surface-variant">Select a card to view details.</p>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
						{rollout.cards.map((c, i) => (
							<button key={c.id} type="button" onClick={() => setOpen(i)} className="flex items-center justify-between gap-space-sm rounded-xl border border-outline-variant/30 bg-surface-container-low p-space-md text-left min-w-0 hover:border-primary">
								<span className="min-w-0">
									<span className="block text-body-md font-body-md font-medium">{c.title}</span>
									<span className="block text-label-md font-label-md text-on-surface-variant">{c.sub}</span>
								</span>
								<Icon name="chevron_right" className="text-[20px] text-outline shrink-0" />
							</button>
						))}
					</div>
				</div>
			</div>
			{card && <CardModal card={card} onClose={() => setOpen(undefined)} />}
		</>
	);
}

'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Icon, Metric, Panel, ProgressBar, TaskList } from '@/components/ui';
import type { TargetResult } from '@/features/migration/target';
import { useMigration } from '@/state/MigrationProvider';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import type { StepViewProps } from '../types';
import { MappingModal } from './MappingModal';
import { useTarget, type TargetState } from './useTarget';

const STEP_INDEX = 6;
const ADVANCE_DELAY_MS = 700;

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading mappings...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Mapping failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 7: maps source technologies to the target (running screen), then lets the reviewer approve each mapping (done screen). */
export function TargetStep({ project, kind, onGate }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const state = useTarget(project, running);
	const { target, progress, complete, approved, ready, error } = state;

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('target-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// Next stays locked until every mapping is approved.
	const allApproved = !!target && approved.length === target.mappings.length;
	useEffect(() => onGate(running || (ready && allApproved)), [onGate, running, ready, allApproved]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!target || !ready) {
		return <Loading />;
	}
	return running
		? <Running target={target} progress={progress} complete={complete} onStop={() => go('ready')} />
		: <Done target={target} state={state} onRerun={async () => { await state.discard(); go('target'); }} />;
}

function Running({ target, progress, complete, onStop }: { target: TargetResult; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? target.logs.length : Math.max(1, Math.ceil(progress * target.logs.length));
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Map to target technology"
				description="Pick the target equivalent for each source framework, library and pattern."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Engine idle' : 'Mapping engine active'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Mapping</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Mapping Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(target.tasks, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<Panel icon="swap_horiz" iconClass="text-secondary" title="Source to Target">
						<ul className="space-y-space-xs text-body-md font-body-md">
							{target.mappings.map((m, i) => (
								<li key={m.id} className="flex items-center justify-between gap-space-sm">
									<span className="text-on-surface-variant">{m.id}</span>
									{progress * target.mappings.length > i ? <span className="text-right min-w-0 truncate">{m.target}</span> : <span className="text-outline">Pending</span>}
								</li>
							))}
						</ul>
					</Panel>
					<Panel icon="terminal" iconClass="text-secondary" title="Mapping Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{target.logs.slice(0, shownLogs).map(l => <li key={l} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

function Done({ target, state, onRerun }: { target: TargetResult; state: TargetState; onRerun: () => void }) {
	const { approved, targetStack, approve } = state;
	const [open, setOpen] = useState<number>();
	const total = target.mappings.length;
	const allApproved = approved.length === total;
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Target Technology Mapped"
				description="Every source technology has a target. Approve each mapping to continue."
				badge={<Badge className={allApproved ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{allApproved ? 'All mappings approved' : `In review (${target.duration}) · ${total} mappings`}</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Re-map Technology</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="library_books" title="Mapping Library" badge={<Badge className={allApproved ? 'bg-tertiary/15 text-tertiary' : 'bg-surface-container-highest text-on-surface-variant'}>{allApproved ? 'Approved' : 'In review'}</Badge>}>
						<div className="grid grid-cols-3 gap-space-sm">
							<Metric icon="list" value={total} label="Total" />
							<Metric icon="check_circle" value={approved.length} label="Approved" tone="tertiary" />
							<Metric icon="pending" value={total - approved.length} label="Pending" tone={total === approved.length ? 'tertiary' : 'secondary'} />
						</div>
						<hr className="border-outline-variant/40" />
						<div className="space-y-space-xs">
							<div className="text-label-sm font-label-sm uppercase text-outline">Migration path</div>
							<div className="text-body-md font-body-md"><span className="text-on-surface-variant">From </span>{target.source}</div>
							<div className="text-body-md font-body-md"><span className="text-on-surface-variant">To </span>{targetStack ?? 'Target stack not locked'}</div>
						</div>
						<hr className="border-outline-variant/40" />
						<div className="text-label-sm font-label-sm uppercase text-outline">By category</div>
						<ul className="space-y-space-xs">
							{target.mappings.map(m => (
								<li key={m.id} className="flex items-center justify-between gap-space-sm text-body-md font-body-md">
									{m.id}
									<span className="text-label-md font-label-md text-on-surface-variant">{approved.includes(m.id) ? 1 : 0}/1 approved</span>
								</li>
							))}
						</ul>
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-sm">
					<p className="text-label-sm font-label-sm text-on-surface-variant">Select a card to view details.</p>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
						{target.mappings.map((m, i) => {
							const ok = approved.includes(m.id);
							return (
								<button key={m.id} type="button" onClick={() => setOpen(i)} className={`flex items-center justify-between gap-space-sm rounded-xl border p-space-md text-left min-w-0 ${ok ? 'border-tertiary/40 bg-tertiary/10' : 'border-outline-variant/30 bg-surface-container-low hover:border-primary'}`}>
									<span className="min-w-0 space-y-1">
										<span className="block"><Badge className="bg-surface-container-highest text-on-surface-variant">{m.id}</Badge></span>
										<span className="block truncate text-body-md font-body-md font-medium">{m.legacy}</span>
										<span className="block truncate text-label-md font-label-md text-on-surface-variant">→ {m.target}</span>
										<span className={`block text-label-md font-label-md ${ok ? 'text-tertiary' : 'text-secondary'}`}>{ok ? 'Approved' : 'Pending approval'}</span>
									</span>
									<Icon name="chevron_right" className="text-[20px] text-outline shrink-0" />
								</button>
							);
						})}
					</div>
				</div>
			</div>
			{open !== undefined && <MappingModal mappings={target.mappings} approved={approved} start={open} onApprove={approve} onClose={() => setOpen(undefined)} />}
		</>
	);
}

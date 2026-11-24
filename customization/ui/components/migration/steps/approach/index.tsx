'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Icon, KV, Panel, ProgressBar, TaskList } from '@/components/ui';
import type { ApproachOption, ApproachResult, ApproachRisk } from '@/features/migration/approach';
import { useMigration } from '@/state/MigrationProvider';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import type { StepViewProps } from '../types';
import { useApproach } from './useApproach';

const STEP_INDEX = 1;
const ADVANCE_DELAY_MS = 700;
const OTHER = 'other';

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading strategies...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Strategy evaluation failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 2: scores decomposition strategies (running screen), then lets the reviewer lock one (done screen). */
export function ApproachStep({ project, kind, onGate }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const state = useApproach(project, running);
	const { approach, progress, complete, decision, ready, error } = state;

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('approach-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// Next stays locked until the reviewer has locked a strategy.
	const locked = !!decision;
	useEffect(() => onGate(running || (ready && locked)), [onGate, running, ready, locked]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!approach || !ready) {
		return <Loading />;
	}
	return running
		? <Running approach={approach} progress={progress} complete={complete} onStop={() => go('ready')} />
		: <Done approach={approach} state={state} onRerun={async () => { await state.discard(); go('approach'); }} />;
}

function Running({ approach, progress, complete, onStop }: { approach: ApproachResult; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? approach.logs.length : Math.max(1, Math.ceil(progress * approach.logs.length));
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Choose a migration approach"
				description="Weigh decomposition strategies against the coupling and risk found during analysis."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Planner idle' : 'Planner active'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Evaluation</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Strategy Evaluation Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(approach.tasks, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<Panel icon="alt_route" iconClass="text-secondary" title="Candidate Strategies" badge={<Badge className="bg-surface-container text-secondary">Scoring</Badge>}>
						<KV rows={approach.options.map(o => ({ k: o.name, v: `${Math.round(progress * o.score)} / 100` }))} />
						<ProgressBar pct={progress * 100} />
					</Panel>
					<Panel icon="terminal" iconClass="text-secondary" title="Planner Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{approach.logs.slice(0, shownLogs).map((l, i) => <li key={`${i}-${l}`} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

function Done({ approach, state, onRerun }: { approach: ApproachResult; state: ReturnType<typeof useApproach>; onRerun: () => void }) {
	const { decision, lock } = state;
	const locked = !!decision;
	const recommended = approach.options.find(o => o.recommended) ?? approach.options[0];
	const [selected, setSelected] = useState<string>(decision?.optionId ?? recommended.id);
	const [custom, setCustom] = useState(decision?.custom ?? '');
	const [expanded, setExpanded] = useState(false);
	const canLock = !locked && (selected !== OTHER || custom.trim().length > 0);
	const chosen = approach.options.find(o => o.id === decision?.optionId);

	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Migration Approach"
				description="Review the recommended decomposition strategy, pick the one to use, and lock it. Later steps build on this choice."
				badge={<Badge className={locked ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{locked ? 'Strategy locked' : `Awaiting your decision (${approach.duration})`}</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Re-evaluate Approach</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-7 space-y-space-lg">
					<Panel icon="alt_route" iconClass="text-secondary" title="Decomposition Strategy" badge={<Badge className="bg-surface-container text-secondary">Pattern: {approach.pattern}</Badge>}>
						<div className="space-y-space-xs">
							<p className={`text-body-md font-body-md text-on-surface-variant ${expanded ? '' : 'line-clamp-2'}`}>{approach.rationale}</p>
							<button type="button" onClick={() => setExpanded(e => !e)} className="text-label-md font-label-md text-on-surface">{expanded ? 'Show less' : 'Show more'}</button>
						</div>
						<div className="text-label-sm font-label-sm uppercase tracking-wider text-outline">Recommended options</div>
						<div className="space-y-space-sm" role="radiogroup" aria-label="Decomposition strategy">
							{approach.options.map(o => <OptionRow key={o.id} option={o} active={selected === o.id} disabled={locked} onSelect={() => setSelected(o.id)} />)}
							<OtherRow active={selected === OTHER} disabled={locked} onSelect={() => setSelected(OTHER)} />
							{selected === OTHER && (
								<input
									value={custom}
									disabled={locked}
									onChange={e => setCustom(e.target.value)}
									placeholder="Describe your decomposition strategy, e.g. by customer segment"
									aria-label="Custom decomposition strategy"
									className="w-full rounded-lg border border-outline-variant/40 bg-surface-container px-space-sm py-2 text-body-md font-body-md outline-none focus:border-primary"
								/>
							)}
						</div>
						{locked ? (
							<div className="flex items-center gap-space-xs text-body-md font-body-md text-tertiary">
								<Icon name="check" className="text-[18px]" />
								{decision.optionId === OTHER ? `Strategy accepted: “${decision.custom}” will guide extraction.` : `Strategy accepted: ${chosen?.name ?? decision.optionId}.`}
							</div>
						) : (
							<Button variant="primary" disabled={!canLock} onClick={() => lock(selected === OTHER ? { optionId: OTHER, custom: custom.trim() } : { optionId: selected })}>
								Lock decomposition strategy
							</Button>
						)}
					</Panel>
					<Panel icon="account_tree" iconClass="text-secondary" title="Suggested Modernization Boundaries">
						<ol className="space-y-space-sm">
							{approach.boundaries.map((b, i) => (
								<li key={b.name}>
									<div className="text-body-md font-body-md">{i + 1}. {b.name} <span className="text-outline">({b.risk})</span></div>
									<div className="text-label-sm font-label-sm text-on-surface-variant">{b.description}</div>
								</li>
							))}
						</ol>
					</Panel>
				</div>
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="report_problem" iconClass="text-error" title="Risks">
						<div className="space-y-space-sm">
							{approach.risks.map(r => <RiskRow key={r.text} risk={r} />)}
						</div>
					</Panel>
				</div>
			</div>
		</>
	);
}

function OptionRow({ option, active, disabled, onSelect }: { option: ApproachOption; active: boolean; disabled: boolean; onSelect: () => void }) {
	return (
		<button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onSelect} className={optionClass(active, false)}>
			<div className="flex flex-wrap items-center gap-space-sm">
				<Icon name={active ? 'check_circle' : 'radio_button_unchecked'} className={`text-[20px] ${active ? 'text-primary' : 'text-outline'}`} />
				<span className="text-body-md font-body-md font-medium">{option.name}</span>
				{option.recommended && <Badge className="bg-tertiary/15 text-tertiary">Recommended</Badge>}
				<span className="ml-auto text-label-sm font-label-sm text-outline">Suitability: {option.suitability}</span>
			</div>
			<div className="pl-8 pt-1 text-label-sm font-label-sm text-on-surface-variant">{option.when}</div>
		</button>
	);
}

function OtherRow({ active, disabled, onSelect }: { active: boolean; disabled: boolean; onSelect: () => void }) {
	return (
		<button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onSelect} className={optionClass(active, true)}>
			<div className="flex items-center gap-space-sm">
				<Icon name={active ? 'check_circle' : 'radio_button_unchecked'} className={`text-[20px] ${active ? 'text-primary' : 'text-outline'}`} />
				<span className="text-body-md font-body-md font-medium">Other: specify a strategy</span>
			</div>
			<div className="pl-8 pt-1 text-label-sm font-label-sm text-outline">Not one of the recommended options? Enter your own.</div>
		</button>
	);
}

function optionClass(active: boolean, dashed: boolean): string {
	const tone = active ? 'border-primary bg-primary/10' : `border-outline-variant/40 hover:bg-surface-container ${dashed ? 'border-dashed' : ''}`;
	return `w-full text-left rounded-lg p-space-sm border transition-colors disabled:cursor-default ${tone}`;
}

function RiskRow({ risk }: { risk: ApproachRisk }) {
	return (
		<div className="space-y-0.5">
			<div className="flex items-start gap-space-xs text-body-md font-body-md">
				<Badge className={risk.level === 'High' ? 'bg-error-container/30 text-error' : 'bg-surface-container-highest text-on-surface-variant'}>{risk.level}</Badge>
				<span>{risk.text}</span>
			</div>
			<div className="text-label-sm font-label-sm text-on-surface-variant">Mitigation: {risk.mitigation}</div>
		</div>
	);
}

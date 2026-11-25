'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Icon, Modal, Panel, ProgressBar, TaskList } from '@/components/ui';
import type { ScopeResult, ScopeSection } from '@/features/migration/scope';
import { useMigration } from '@/state/MigrationProvider';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import type { StepViewProps } from '../types';
import { GapModal } from './GapModal';
import { CUSTOM_STACK, useScope, type ScopeState } from './useScope';

const STEP_INDEX = 5;
const ADVANCE_DELAY_MS = 700;
const FIELD = 'block rounded border border-outline-variant/40 bg-surface-container-low px-space-sm py-1.5 text-body-md font-body-md text-on-surface outline-none focus:border-primary';

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading scope...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Scope drafting failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 6: drafts scope, goals and target stack options (running screen), then lets the reviewer choose a stack, resolve gaps and lock it (done screen). */
export function ScopeStep({ project, kind, onGate, onStop }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const state = useScope(project, running);
	const { scope, progress, complete, decision, ready, error } = state;

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('scope-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// Next stays locked until the reviewer has locked the target stack.
	useEffect(() => onGate(running || (ready && decision.locked)), [onGate, running, ready, decision.locked]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!scope || !ready) {
		return <Loading />;
	}
	return running
		? <Running scope={scope} progress={progress} complete={complete} onStop={onStop} />
		: <Done scope={scope} state={state} onRerun={async () => { await state.discard(); go('scope'); }} />;
}

function Running({ scope, progress, complete, onStop }: { scope: ScopeResult; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? scope.logs.length : Math.max(1, Math.ceil(progress * scope.logs.length));
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Confirm scope, goals and outcomes"
				description="Review what is in and out of scope and the outcomes the migration commits to. This step waits for your confirmation."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Scope drafted' : 'Drafting scope'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Drafting</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Scope Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(scope.tasks, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<Panel icon="fact_check" iconClass="text-secondary" title="Draft Scope">
						<ProgressBar pct={progress * 100} />
						<p className="text-body-md font-body-md text-on-surface-variant">Collecting scope items from the units and dependency graph.</p>
					</Panel>
					<Panel icon="terminal" iconClass="text-secondary" title="Planner Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{scope.logs.slice(0, shownLogs).map((l, i) => <li key={`${i}-${l}`} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

type ModalState = { kind: 'section'; id: string } | { kind: 'gap'; start: number };

function Done({ scope, state, onRerun }: { scope: ScopeResult; state: ScopeState; onRerun: () => void }) {
	const { decision, update, lock } = state;
	const [modal, setModal] = useState<ModalState>();
	const locked = decision.locked;
	const custom = decision.stack === CUSTOM_STACK;
	const candidate = scope.stacks.find(s => s.id === decision.stack);
	const chosen = custom ? decision.customStack?.trim() : candidate?.name;
	const stackReady = !!chosen;
	const resolvedCount = Object.keys(decision.resolutions).length;
	const gapsDone = scope.gapsReady && resolvedCount === scope.gaps.length;
	const section = modal?.kind === 'section' ? scope.sections.find(s => s.id === modal.id) : undefined;
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Confirm Scope, Goals and Outcomes"
				description="Review the goals and scope, choose the target stack and resolve every gap, then lock the stack to continue."
				badge={<Badge className={locked ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{locked ? 'Target stack locked' : `Awaiting your confirmation (${scope.duration})`}</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Revise Scope</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="flag" title="Modernization Goals" badge={<span className="text-label-md font-label-md text-on-surface-variant">Reference only</span>}>
						<div className="space-y-space-sm">
							{scope.goals.map(g => (
								<div key={g.title} className="bg-surface-container rounded-lg p-space-sm space-y-0.5">
									<div className="text-body-md font-body-md font-medium">{g.title}</div>
									<div className="text-label-sm font-label-sm text-on-surface-variant">{g.description}</div>
									<div className="text-label-sm font-label-sm text-outline">Success: {g.success}</div>
								</div>
							))}
						</div>
					</Panel>
					{locked
						? <LockedCard scope={scope} state={state} chosen={chosen ?? ''} architecture={custom ? 'custom' : candidate?.architecture ?? ''} />
						: <StackPicker scope={scope} state={state} stackReady={stackReady} gapsDone={gapsDone} onLock={() => void lock()} />}
				</div>
				<div className="lg:col-span-7 space-y-space-sm">
					<p className="text-label-sm font-label-sm text-on-surface-variant">Select a card to view details.</p>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
						{!locked && (
							!stackReady
								? <Tile title="Analyze Gaps" summary="Select a tech stack first." disabled onClick={() => undefined} />
								: state.gapsRunning
								? <Tile title="Analyzing Gaps" summary={`Reading the source against ${chosen}... ${Math.round(state.gapsProgress * 100)}%`} disabled onClick={() => undefined} />
								: !scope.gapsReady
								? <Tile title="Analyze Gaps" summary={`Run gap analysis against ${chosen}, ${decision.database} and ${decision.strategy}.`} attention onClick={() => void state.analyzeGaps()} />
								: <Tile
									title="Review Gaps"
									summary={scope.gaps.length === 0 ? 'No gaps found.' : `${resolvedCount} / ${scope.gaps.length} resolved`}
									attention={!gapsDone}
									disabled={scope.gaps.length === 0}
									onClick={() => setModal({ kind: 'gap', start: Math.max(0, Math.min(resolvedCount, scope.gaps.length - 1)) })}
								/>
						)}
						{scope.sections.map(s => <Tile key={s.id} title={s.title} summary={s.summary} onClick={() => setModal({ kind: 'section', id: s.id })} />)}
					</div>
				</div>
			</div>
			{section && <SectionModal section={section} onClose={() => setModal(undefined)} />}
			{modal?.kind === 'gap' && (
				<GapModal
					gaps={scope.gaps}
					resolutions={decision.resolutions}
					start={modal.start}
					onResolve={(gapId, resolution) => update({ resolutions: { ...decision.resolutions, [gapId]: resolution } })}
					onClose={() => setModal(undefined)}
				/>
			)}
		</>
	);
}

function Tile({ title, summary, attention = false, disabled = false, onClick }: { title: string; summary: string; attention?: boolean; disabled?: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={`flex items-center justify-between rounded-xl border p-space-md text-left disabled:opacity-50 disabled:cursor-not-allowed ${attention ? 'border-secondary/40 bg-secondary-container/20 text-secondary' : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container'}`}
		>
			<span>
				<span className="block text-body-md font-body-md font-medium">{title}</span>
				<span className="block text-label-md font-label-md text-on-surface-variant">{summary}</span>
			</span>
			<Icon name="chevron_right" className="text-[20px] text-outline" />
		</button>
	);
}

function SectionModal({ section, onClose }: { section: ScopeSection; onClose: () => void }) {
	return (
		<Modal title={section.title} onClose={onClose}>
			<div className="space-y-space-sm">
				{section.items.map(i => (
					<div key={i.title} className="bg-surface-container-low rounded-lg p-space-sm">
						<div className="text-body-md font-body-md font-medium">{i.title}</div>
						<div className="text-label-sm font-label-sm text-on-surface-variant">{i.description}</div>
					</div>
				))}
			</div>
		</Modal>
	);
}

function StackPicker({ scope, state, stackReady, gapsDone, onLock }: { scope: ScopeResult; state: ScopeState; stackReady: boolean; gapsDone: boolean; onLock: () => void }) {
	const { decision, update } = state;
	return (
		<Panel icon="layers" iconClass="text-secondary" title="Select Tech Stack" badge={<Badge className="bg-secondary-container/20 text-secondary">Required</Badge>}>
			<p className="text-body-md font-body-md text-on-surface-variant">Choose the target stack and architecture. This is a selectable choice, not just information.</p>
			<div className="space-y-space-sm" role="radiogroup" aria-label="Target stack">
				{scope.stacks.map(s => {
					const selected = decision.stack === s.id;
					return (
						<button key={s.id} type="button" role="radio" aria-checked={selected} onClick={() => update({ stack: s.id })} className={`w-full text-left rounded-lg border p-space-sm space-y-1 bg-surface-container ${selected ? 'border-primary' : 'border-outline-variant/30 hover:border-outline'}`}>
							<div className="flex items-start justify-between gap-space-sm">
								<span className="text-headline-sm font-headline-sm">{s.name}</span>
								<Icon name={selected ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-[22px] text-primary" />
							</div>
							<div className="text-label-sm font-label-sm uppercase text-on-surface-variant">{s.architecture}</div>
							<p className="text-body-md font-body-md">{s.description}</p>
							<p className="text-label-sm font-label-sm text-on-surface-variant">{s.tradeoff}</p>
						</button>
					);
				})}
				<button type="button" role="radio" aria-checked={decision.stack === CUSTOM_STACK} onClick={() => update({ stack: CUSTOM_STACK })} className={`w-full text-left rounded-lg border border-dashed p-space-sm space-y-1 bg-surface-container ${decision.stack === CUSTOM_STACK ? 'border-primary' : 'border-outline-variant/50'}`}>
					<div className="flex items-start justify-between gap-space-sm">
						<span className="text-headline-sm font-headline-sm">Other: Specify a Target Stack</span>
						<Icon name={decision.stack === CUSTOM_STACK ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-[22px] text-primary" />
					</div>
					<p className="text-label-sm font-label-sm text-on-surface-variant">Not one of the proposed candidates? Enter your own stack.</p>
				</button>
				{decision.stack === CUSTOM_STACK && (
					<input aria-label="Custom target stack" value={decision.customStack ?? ''} onChange={e => update({ customStack: e.target.value })} placeholder="e.g. Spring Boot + React" className={`${FIELD} w-full`} />
				)}
			</div>
			<label className="block space-y-1 text-label-md font-label-md text-on-surface-variant">
				Database
				<select value={decision.database} onChange={e => update({ database: e.target.value })} className={FIELD}>
					{scope.databases.map(d => <option key={d}>{d}</option>)}
				</select>
			</label>
			<label className="block space-y-1 text-label-md font-label-md text-on-surface-variant">
				Strategy
				<select value={decision.strategy} onChange={e => update({ strategy: e.target.value })} className={FIELD}>
					{scope.strategies.map(d => <option key={d}>{d}</option>)}
				</select>
			</label>
			<Button variant="primary" disabled={!stackReady || !gapsDone} onClick={onLock}>Lock Target Stack</Button>
			{!(stackReady && gapsDone) && (
				<p className="text-label-sm font-label-sm text-on-surface-variant">{!stackReady ? 'Select a tech stack to continue.' : !scope.gapsReady ? 'Analyze the gaps for this selection before locking. Changing the stack, database or strategy discards the analysis.' : 'Resolve all gaps to lock the target stack.'}</p>
			)}
			{state.actionError && <p role="alert" className="text-label-sm font-label-sm text-error">{state.actionError}</p>}
		</Panel>
	);
}

function LockedCard({ scope, state, chosen, architecture }: { scope: ScopeResult; state: ScopeState; chosen: string; architecture: string }) {
	const { decision } = state;
	const rows: [string, string][] = [
		['Target stack', chosen],
		['Architecture', architecture],
		['Database', decision.database],
		['Strategy', decision.strategy],
		['Gaps resolved', `${Object.keys(decision.resolutions).length} / ${scope.gaps.length}`]
	];
	return (
		<Panel icon="check_circle" iconClass="text-tertiary" title="Target Stack Locked">
			<dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-1 text-body-md font-body-md">
				{rows.map(([k, v]) => (
					<div key={k} className="contents">
						<dt className="text-on-surface-variant">{k}</dt>
						<dd className="min-w-0 break-words">{v}</dd>
					</div>
				))}
			</dl>
		</Panel>
	);
}

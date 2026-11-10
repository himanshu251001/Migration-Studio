'use client';

import { useEffect, useState } from 'react';
import { ArtifactCard, Badge, Button, Icon, KV, Metric, Panel, ProgressBar, TaskList } from '@/components/ui';
import type { ArtifactRef } from '@/features/migration/analyze';
import type { Project } from '@/features/migration/types';
import type { MigrationUnit, UnitsResult } from '@/features/migration/units';
import { isEmbedded, postToHost } from '@/lib/hostBridge';
import { useServices } from '@/services/ServiceProvider';
import { useMigration } from '@/state/MigrationProvider';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import type { StepViewProps } from '../types';
import { useUnits, type UnitsState } from './useUnits';

const STEP_INDEX = 3;
const ADVANCE_DELAY_MS = 700;

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading units...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Grouping failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 4: groups components into migration units (running screen), then lets the reviewer order and lock them (done screen). */
export function UnitsStep({ project, kind, onGate }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const state = useUnits(project, running);
	const { units, progress, complete, locked, ready, error } = state;

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('units-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// Next stays locked until the reviewer has locked the catalog.
	useEffect(() => onGate(running || (ready && locked)), [onGate, running, ready, locked]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!units || !ready) {
		return <Loading />;
	}
	return running
		? <Running units={units} progress={progress} complete={complete} onStop={() => go('ready')} />
		: <Done units={units} state={state} project={project} onRerun={async () => { await state.discard(); go('units'); }} />;
}

function Running({ units, progress, complete, onStop }: { units: UnitsResult; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? units.logs.length : Math.max(1, Math.ceil(progress * units.logs.length));
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Group into migration units"
				description="Cluster the indexed components into self-contained units that can be migrated and released independently."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Planner idle' : 'Planner active'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Grouping</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Grouping Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(units.tasks, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<Panel icon="workspaces" iconClass="text-secondary" title="Units Forming">
						<KV rows={units.units.map((u, i) => ({ k: u.id, v: progress * units.units.length > i ? u.name : <span className="text-outline">Pending</span> }))} />
					</Panel>
					<Panel icon="terminal" iconClass="text-secondary" title="Planner Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{units.logs.slice(0, shownLogs).map(l => <li key={l} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

function Done({ units, state, project, onRerun }: { units: UnitsResult; state: UnitsState; project: Project; onRerun: () => void }) {
	const { artifacts } = useServices();
	const { order, locked, lock, move } = state;
	const byId = new Map(units.units.map(u => [u.id, u]));
	const [openError, setOpenError] = useState<string>();
	// Writes the artifact to disk, then asks the IDE to open it.
	const openArtifact = async (artifact: ArtifactRef) => {
		setOpenError(undefined);
		try {
			const path = await artifacts.materialize(project, artifact);
			postToHost({ v: 1, type: 'openFile', payload: { path, preview: artifact.path.endsWith('.md') } });
		} catch (error) {
			setOpenError(error instanceof Error ? error.message : 'Could not open the artifact.');
		}
	};
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Migration Units Defined"
				description={`${units.units.length} migration units were formed from ${units.componentsPlaced} components, with no overlaps. Set the order, then lock the catalog to continue.`}
				badge={<Badge className={locked ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{locked ? 'Catalog locked' : `Awaiting your review (${units.duration})`}</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Regroup Units</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon={locked ? 'check_circle' : 'lock_open'} iconClass={locked ? 'text-tertiary' : 'text-secondary'} title="Unit Catalog">
						<p className="text-body-md font-body-md text-on-surface-variant">
							{locked ? 'Catalog locked. Dependency analysis is unlocked.' : 'Review the units and their order, then lock the catalog to unlock dependency analysis.'}
						</p>
						<Button variant="primary" disabled={locked} onClick={() => void lock()}>{locked ? 'Migration Units Catalog Locked' : 'Lock Migration Units Catalog'}</Button>
					</Panel>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
						<Metric icon="workspaces" value={units.units.length} label="Units Defined" />
						<Metric icon="view_in_ar" value={units.componentsPlaced} label="Components Placed" tone="secondary" />
					</div>
					<Panel icon="data_object" iconClass="text-secondary" title="Generated Unit Artifacts">
						<div className="space-y-space-sm">
							{units.artifacts.map(a => <ArtifactCard key={a.id} icon={a.icon} name={a.name} meta={a.meta} onOpen={isEmbedded() ? () => void openArtifact(a) : undefined} />)}
						</div>
						{openError && <p className="mt-space-sm text-label-sm font-label-sm text-error">{openError}</p>}
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-sm">
					{order.map((id, i) => {
						const unit = byId.get(id);
						return unit && <UnitRow key={id} unit={unit} position={i + 1} first={i === 0} last={i === order.length - 1} locked={locked} onMove={d => move(i, d)} />;
					})}
				</div>
			</div>
		</>
	);
}

function UnitRow({ unit, position, first, last, locked, onMove }: { unit: MigrationUnit; position: number; first: boolean; last: boolean; locked: boolean; onMove: (direction: -1 | 1) => void }) {
	return (
		<div className="bg-surface-container-low rounded-xl p-space-md flex items-start justify-between gap-space-md">
			<div className="min-w-0 space-y-1">
				<div className="flex flex-wrap items-center gap-space-sm">
					<span className="text-label-md font-label-md text-outline">#{position}</span>
					<span className="text-headline-sm font-headline-sm">{unit.name}</span>
					<Badge className="bg-surface-container-highest text-on-surface-variant">{unit.size}</Badge>
				</div>
				<div className="text-label-sm font-label-sm text-on-surface-variant">Domain: {unit.domain}</div>
				<div className="text-label-sm font-label-sm text-on-surface-variant">Capabilities: {unit.capabilities}</div>
			</div>
			<div className="flex gap-space-xs shrink-0">
				<MoveButton label={`Move ${unit.name} up`} icon="arrow_upward" disabled={locked || first} onClick={() => onMove(-1)} />
				<MoveButton label={`Move ${unit.name} down`} icon="arrow_downward" disabled={locked || last} onClick={() => onMove(1)} />
			</div>
		</div>
	);
}

function MoveButton({ label, icon, disabled, onClick }: { label: string; icon: string; disabled: boolean; onClick: () => void }) {
	return (
		<button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="w-8 h-8 rounded border border-outline-variant/40 flex items-center justify-center hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed">
			<Icon name={icon} className="text-[16px]" />
		</button>
	);
}

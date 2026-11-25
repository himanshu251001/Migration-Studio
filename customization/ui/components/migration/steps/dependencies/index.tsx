'use client';

import { useEffect, useState } from 'react';
import { ArtifactCard, Badge, Button, Icon, Metric, Panel, ProgressBar, TaskList } from '@/components/ui';
import type { ArtifactRef } from '@/features/migration/analyze';
import type { DependenciesResult, DependencyWave } from '@/features/migration/dependencies';
import type { Project } from '@/features/migration/types';
import { isEmbedded, postToHost } from '@/lib/hostBridge';
import { useServices } from '@/services/ServiceProvider';
import { useMigration } from '@/state/MigrationProvider';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import type { StepViewProps } from '../types';
import { useDependencies } from './useDependencies';

const STEP_INDEX = 4;
const ADVANCE_DELAY_MS = 700;

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading dependencies...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Tracing failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 5: traces dependencies between units (running screen), then shows the execution waves (done screen). */
export function DependenciesStep({ project, kind, onGate, onStop }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const { dependencies, progress, complete, error } = useDependencies(project, running);

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('dependencies-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// Nothing to sign off here: Next is open once the screen is done.
	useEffect(() => onGate(true), [onGate]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!dependencies) {
		return <Loading />;
	}
	return running
		? <Running result={dependencies} progress={progress} complete={complete} onStop={onStop} />
		: <Done result={dependencies} project={project} onRerun={() => go('dependencies')} />;
}

function Running({ result, progress, complete, onStop }: { result: DependenciesResult; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? result.logs.length : Math.max(1, Math.ceil(progress * result.logs.length));
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Find cross-unit dependencies"
				description="Trace calls, shared data and shared state between units to fix a safe migration order."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Graph worker idle' : 'Graph worker active'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Tracing</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Dependency Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(result.tasks, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<div className="grid grid-cols-2 gap-space-sm">
						<Metric icon="call_split" value={Math.round(progress * result.crossUnitEdges)} label="Cross-Unit Edges" />
						<Metric icon="share" value={Math.round(progress * result.sharedResources)} label="Shared Resources" tone="secondary" />
					</div>
					<Panel icon="terminal" iconClass="text-secondary" title="Graph Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{result.logs.slice(0, shownLogs).map((l, i) => <li key={`${i}-${l}`} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

function Done({ result, project, onRerun }: { result: DependenciesResult; project: Project; onRerun: () => void }) {
	const { artifacts } = useServices();
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
				title="Cross-Unit Dependencies Mapped"
				description={`${result.crossUnitEdges} dependencies between units were found, ${result.circularRefs === 0 ? 'none circular' : `${result.circularRefs} circular`}. The execution order is fixed.`}
				badge={<Badge className={result.circularRefs === 0 ? 'bg-tertiary/15 text-tertiary' : 'bg-error-container/20 text-error'}>Dependencies mapped ({result.duration}) · {result.circularRefs} circular refs</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Re-trace Dependencies</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
						<Metric icon="call_split" value={result.crossUnitEdges} label="Cross-Unit Edges" />
						<Metric icon="share" value={result.sharedResources} label="Shared Resources" tone="secondary" />
						<Metric icon="sync_problem" value={result.circularRefs} label="Circular Refs" tone={result.circularRefs === 0 ? 'tertiary' : 'error'} />
					</div>
					<Panel icon="account_tree" iconClass="text-tertiary" title="Execution Order">
						<p className="text-body-md font-body-md text-on-surface-variant">{result.criticalPath}</p>
						<div className="text-label-sm font-label-sm text-outline">Critical execution path</div>
					</Panel>
					<Panel icon="data_object" iconClass="text-secondary" title="Generated Dependency Artifacts">
						<div className="space-y-space-sm">
							{result.artifacts.map(a => <ArtifactCard key={a.id} icon={a.icon} name={a.name} meta={a.meta} onOpen={isEmbedded() ? () => void openArtifact(a) : undefined} />)}
						</div>
						{openError && <p className="mt-space-sm text-label-sm font-label-sm text-error">{openError}</p>}
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-sm">
					{result.waves.map((wave, i) => <Wave key={i} wave={wave} index={i} />)}
				</div>
			</div>
		</>
	);
}

function Wave({ wave, index }: { wave: DependencyWave; index: number }) {
	return (
		<div className="bg-surface-container-low rounded-xl p-space-md space-y-space-sm">
			<h3 className="text-headline-sm font-headline-sm">Wave {index}</h3>
			{wave.units.map(u => (
				<div key={u.name} className="bg-surface-container rounded-lg p-space-sm space-y-1">
					<div className="text-body-md font-body-md font-medium">{u.name}</div>
					<div className="text-label-sm font-label-sm text-on-surface-variant">
						{u.needs.length === 0 ? 'No unresolved upstream dependencies.' : `Depends on ${u.needs.join(', ')} (wave ${index - 1} or earlier).`}
					</div>
				</div>
			))}
		</div>
	);
}

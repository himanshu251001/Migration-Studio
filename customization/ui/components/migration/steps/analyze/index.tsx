'use client';

import { useEffect } from 'react';
import { ArtifactCard, Badge, Button, Icon, Panel, ProgressBar, TaskList, type Task } from '@/components/ui';
import type { AnalysisResult } from '@/features/migration/analyze';
import type { Project } from '@/features/migration/types';
import { useMigration } from '@/state/MigrationProvider';
import type { StepViewProps } from '../types';
import { DiscoveryPanel } from './DiscoveryPanel';
import { useAnalyze } from './useAnalyze';

const ADVANCE_DELAY_MS = 700;

function format(n: number): string {
	return n.toLocaleString('en-US');
}

/** Task states at `progress`: tasks finish in order, each taking an equal share of the run. */
function toTasks(analysis: AnalysisResult, progress: number, finished: boolean): Task[] {
	return analysis.tasks.map((t, i) => {
		const local = progress * analysis.tasks.length - i;
		if (finished || local >= 1) {
			return { label: t.label, meta: t.doneMeta, state: 'done' };
		}
		if (local > 0 || (i === 0 && progress === 0)) {
			const frac = Math.max(0, local);
			return { label: t.label, meta: t.total ? `${format(Math.round(frac * t.total))} / ${format(t.total)}` : 'working', state: 'active', progress: frac };
		}
		return { label: t.label, state: 'queued' };
	});
}

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading analysis...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Analysis failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 1: scans the legacy codebase (running screen), then shows what was found (done screen). */
export function AnalyzeStep({ project, kind }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const { analysis, progress, complete, error } = useAnalyze(project, running);

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('analyze-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!analysis) {
		return <Loading />;
	}
	return running
		? <Running analysis={analysis} progress={progress} complete={complete} onStop={() => go('ready')} />
		: <Done analysis={analysis} project={project} onRerun={() => go('analyze')} />;
}

function Running({ analysis, progress, complete, onStop }: { analysis: AnalysisResult; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? analysis.logs.length : Math.max(1, Math.ceil(progress * analysis.logs.length));
	return (
		<>
			<Header
				title="Analyze the source codebase"
				description="Scan the source repository, catalog dependencies, parse legacy WebForms schemas and compute technical debt metrics."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Complete' : 'In progress'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Analysis</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(analysis, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<DiscoveryPanel analysis={analysis} progress={progress} live />
					<Panel icon="terminal" iconClass="text-secondary" title="Analysis Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{analysis.logs.slice(0, shownLogs).map(l => <li key={l} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

function Done({ analysis, project, onRerun }: { analysis: AnalysisResult; project: Project; onRerun: () => void }) {
	return (
		<>
			<Header
				title="Source Codebase Analysis Results"
				description="Abstract syntax tree extraction, static reference extraction and assembly mapping are complete. Review the components and risk scores before choosing a migration approach."
				badge={<Badge className="bg-tertiary/15 text-tertiary">Analysis finished ({analysis.duration}) · {analysis.errors} errors</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Re-run Analysis</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{analysis.tasks.length} of {analysis.tasks.length}</span>}>
						<ProgressBar pct={100} tone="bg-tertiary" />
						<TaskList tasks={toTasks(analysis, 1, true)} />
					</Panel>
					<Panel icon="description" iconClass="text-secondary" title="Generated Migration Artifacts">
						<div className="space-y-space-sm">
							{analysis.artifacts.map(a => <ArtifactCard key={a.id} icon={a.icon} name={a.name} meta={a.meta} />)}
						</div>
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<DiscoveryPanel analysis={analysis} progress={1} live={false} />
					<Panel icon="warning" iconClass="text-error" title="Primary Blockers and Debt Flags">
						<p className="text-body-sm font-body-sm text-on-surface-variant">{analysis.blockers}</p>
					</Panel>
					<p className="text-label-sm font-label-sm text-outline px-1">Analyzed {project.name} · read-only access</p>
				</div>
			</div>
		</>
	);
}

function Header({ title, description, badge, actions }: { title: string; description: string; badge: React.ReactNode; actions?: React.ReactNode }) {
	return (
		<div className="flex flex-col md:flex-row md:items-start justify-between gap-space-md">
			<div className="space-y-space-xs min-w-0">
				<div className="text-label-sm font-label-sm uppercase tracking-wider text-outline">Step 1 of 10</div>
				<h2 className="font-headline-lg text-headline-lg">{title}</h2>
				<p className="text-body-md font-body-md text-on-surface-variant max-w-3xl">{description}</p>
				<div>{badge}</div>
			</div>
			{actions && <div className="flex items-center gap-space-sm shrink-0">{actions}</div>}
		</div>
	);
}

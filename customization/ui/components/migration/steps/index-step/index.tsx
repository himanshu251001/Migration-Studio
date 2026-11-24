'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Icon, KV, Metric, Panel, ProgressBar, TaskList } from '@/components/ui';
import type { Capability, IndexDomain, IndexResult } from '@/features/migration/componentIndex';
import { useMigration } from '@/state/MigrationProvider';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import type { StepViewProps } from '../types';
import { useIndex, type IndexState } from './useIndex';

const STEP_INDEX = 2;
const ADVANCE_DELAY_MS = 700;

function format(n: number): string {
	return n.toLocaleString('en-US');
}

function Loading() {
	return (
		<div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
			<Icon name="progress_activity" className="text-[18px] text-primary animate-spin" /> Loading index...
		</div>
	);
}

function Failed({ message }: { message: string }) {
	return <Panel icon="error" iconClass="text-error" title="Indexing failed"><p className="text-body-md font-body-md text-on-surface-variant">{message}</p></Panel>;
}

/** Step 3: catalogs the components (running screen), then lists capabilities by domain for deep analysis (done screen). */
export function IndexStep({ project, kind, onGate }: StepViewProps) {
	const running = kind === 'running';
	const { go } = useMigration();
	const state = useIndex(project, running);
	const { index, progress, complete, analyzed, ready, error } = state;

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('index-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// Next stays locked until every capability has a deep analysis.
	const total = index?.domains.reduce((sum, d) => sum + d.capabilities.length, 0) ?? 0;
	const allAnalyzed = ready && total > 0 && analyzed.size >= total;
	useEffect(() => onGate(running || allAnalyzed), [onGate, running, allAnalyzed]);

	if (error && !index) {
		return <Failed message={error} />;
	}
	if (!index || !ready) {
		return <Loading />;
	}
	return running
		? <Running index={index} progress={progress} complete={complete} onStop={() => go('ready')} />
		: <Done index={index} state={state} total={total} onRerun={async () => { await state.discard(); go('index'); }} />;
}

function Running({ index, progress, complete, onStop }: { index: IndexResult; progress: number; complete: boolean; onStop: () => void }) {
	const shownLogs = complete ? index.logs.length : Math.max(1, Math.ceil(progress * index.logs.length));
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Build the component index"
				description="Catalog every page, control, service and data class so each can be assigned to a migration unit."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Indexer idle' : 'Indexer active'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Indexing</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Indexing Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(index.tasks, progress, complete)} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
						<Metric icon="view_in_ar" value={Math.round(progress * index.metrics.components)} label="Components Indexed" />
						<Metric icon="description" value={format(Math.round(progress * index.metrics.filesLinked))} label="Files Linked" tone="secondary" />
					</div>
					<Panel icon="terminal" iconClass="text-secondary" title="Indexer Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{index.logs.slice(0, shownLogs).map((l, i) => <li key={`${i}-${l}`} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

function Done({ index, state, total, onRerun }: { index: IndexResult; state: IndexState; total: number; onRerun: () => void }) {
	const { analyzed, generating, generate, error } = state;
	const [domainName, setDomainName] = useState(index.domains[0]?.name);
	const domain = index.domains.find(d => d.name === domainName) ?? index.domains[0];
	const allAnalyzed = analyzed.size >= total;
	return (
		<>
			<StepHeader
				step={STEP_INDEX}
				title="Component Index Built"
				description={`${index.metrics.components} components were cataloged and linked to their source files. Generate a deep analysis for every capability to continue.`}
				badge={<Badge className={allAnalyzed ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{allAnalyzed ? 'All capabilities analyzed' : `${analyzed.size} of ${total} analyzed (${index.duration})`}</Badge>}
				actions={<Button icon="replay" onClick={onRerun}>Rebuild Index</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="category" iconClass="text-secondary" title="Business Capability Index">
						<p className="text-body-sm font-body-sm text-on-surface-variant">Grouped by domain, per the locked decomposition strategy.</p>
						<div className="text-label-sm font-label-sm uppercase tracking-wider text-outline">Domains ({total} capabilities)</div>
						<div className="space-y-space-xs" role="tablist" aria-label="Domains">
							{index.domains.map(d => <DomainRow key={d.name} domain={d} active={d.name === domain?.name} analyzed={analyzed} onSelect={() => setDomainName(d.name)} />)}
						</div>
					</Panel>
					<Panel icon="list_alt" iconClass="text-secondary" title="Index Breakdown" badge={<Badge className="bg-surface-container text-secondary">Verified</Badge>}>
						<KV rows={index.breakdown.map(b => ({ k: b.label, v: b.value }))} />
					</Panel>
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					{domain && (
						<Panel icon="widgets" iconClass="text-secondary" title={`Domain: ${domain.name}`}>
							<div className="space-y-space-sm">
								{domain.capabilities.map(c => (
									<CapabilityCard key={c.id} capability={c} done={analyzed.has(c.id)} busy={generating.has(c.id)} onGenerate={() => void generate(c.id)} />
								))}
							</div>
							{error && <p className="text-label-sm font-label-sm text-error">{error}</p>}
						</Panel>
					)}
				</div>
			</div>
		</>
	);
}

function DomainRow({ domain, active, analyzed, onSelect }: { domain: IndexDomain; active: boolean; analyzed: ReadonlySet<string>; onSelect: () => void }) {
	const done = domain.capabilities.filter(c => analyzed.has(c.id)).length;
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			onClick={onSelect}
			className={`w-full flex items-center justify-between rounded-lg border px-space-sm py-2 text-body-md font-body-md transition-colors ${active ? 'border-primary bg-primary/10' : 'border-outline-variant/40 hover:bg-surface-container'}`}
		>
			{domain.name}
			<span className="text-on-surface-variant">{done}/{domain.capabilities.length}</span>
		</button>
	);
}

function CapabilityCard({ capability, done, busy, onGenerate }: { capability: Capability; done: boolean; busy: boolean; onGenerate: () => void }) {
	return (
		<div className="rounded-lg border border-outline-variant/30 bg-surface-container">
			<div className="p-space-sm space-y-1">
				<div className="flex flex-wrap items-start justify-between gap-space-sm">
					<span className="text-body-md font-body-md font-medium">{capability.name}</span>
					<span className="flex gap-space-xs shrink-0">
						<Badge className="bg-surface-container-highest text-on-surface-variant">{capability.frequency} freq</Badge>
						<Badge className="bg-surface-container-highest text-on-surface-variant">{capability.criticality} criticality</Badge>
					</span>
				</div>
				<p className="text-label-sm font-label-sm text-on-surface-variant">Enables {capability.persona} to complete “{capability.name}” without manual workaround.</p>
				<div className="text-label-sm font-label-sm text-outline">Personas: {capability.persona}</div>
			</div>
			<div className="border-t border-outline-variant/30 p-space-sm">
				{done ? (
					<div className="flex items-center gap-space-xs text-body-sm font-body-sm text-tertiary">
						<Icon name="check_circle" className="text-[16px]" /> Deep analysis ready · {capability.analysisSummary}
					</div>
				) : (
					<Button variant="primary" disabled={busy} onClick={onGenerate}>{busy ? 'Generating...' : 'Generate Deep Analysis'}</Button>
				)}
			</div>
		</div>
	);
}

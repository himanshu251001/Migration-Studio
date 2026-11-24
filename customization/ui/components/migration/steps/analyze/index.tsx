'use client';

import { useEffect, useRef, useState } from 'react';
import { RERUN_WITH_COMMENTS_EVENT } from '@/components/HostBridgeProvider';
import { ArtifactCard, Badge, Button, Icon, Panel, ProgressBar, TaskList } from '@/components/ui';
import type { AnalysisResult, ArtifactRef } from '@/features/migration/analyze';
import { useReviewComments, type ReviewComment } from '@/features/migration/comments';
import type { Project } from '@/features/migration/types';
import { isEmbedded, postToHost } from '@/lib/hostBridge';
import { useServices } from '@/services/ServiceProvider';
import { useMigration } from '@/state/MigrationProvider';
import type { StepViewProps } from '../types';
import { StepHeader } from '../StepHeader';
import { toTasks } from '../taskProgress';
import { DiscoveryPanel } from './DiscoveryPanel';
import { useAnalyze } from './useAnalyze';

const ADVANCE_DELAY_MS = 700;

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
	const { go, analyzeRerunComments, setAnalyzeRerunComments } = useMigration();
	const { analysis, progress, complete, error, live, logs } = useAnalyze(project, running);

	// The running screen opens its done screen by itself once the run has finished.
	useEffect(() => {
		if (!running || !complete) {
			return;
		}
		const t = setTimeout(() => go('analyze-done'), ADVANCE_DELAY_MS);
		return () => clearTimeout(t);
	}, [running, complete, go]);

	// The comments only apply to the run they were sent with: forget them once that run has finished.
	useEffect(() => {
		if (running && complete && analyzeRerunComments.length > 0) {
			setAnalyzeRerunComments([]);
		}
	}, [running, complete, analyzeRerunComments, setAnalyzeRerunComments]);

	if (error) {
		return <Failed message={error} />;
	}
	if (!analysis) {
		return <Loading />;
	}
	return running
		? <Running analysis={analysis} progress={progress} live={live} logs={logs} complete={complete} comments={analyzeRerunComments} onStop={() => { setAnalyzeRerunComments([]); go('ready'); }} />
		: <Done analysis={analysis} project={project} onRerun={() => { setAnalyzeRerunComments([]); go('analyze'); }} />;
}

function Running({ analysis, progress, live, logs, complete, comments, onStop }: { analysis: AnalysisResult; progress: number; live: boolean; logs: readonly string[]; complete: boolean; comments: readonly ReviewComment[]; onStop: () => void }) {
	const shownLogs = complete ? analysis.logs.length : Math.max(1, Math.ceil(progress * analysis.logs.length));
	const lines = live ? logs : analysis.logs.slice(0, shownLogs);
	return (
		<>
			<StepHeader
				step={0}
				title="Analyze the source codebase"
				description="Scan the source repository, catalog dependencies, parse legacy WebForms schemas and compute technical debt metrics."
				badge={<Badge className={complete ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{complete ? 'Complete' : comments.length > 0 ? `Re-running with ${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}` : 'In progress'}</Badge>}
				actions={!complete && <Button variant="ghost" icon="stop" onClick={onStop} className="text-error!">Stop Analysis</Button>}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{Math.round(progress * 100)}%</span>}>
						<ProgressBar pct={progress * 100} tone={complete ? 'bg-tertiary' : 'bg-primary'} />
						<TaskList tasks={toTasks(analysis.tasks, progress, complete)} />
					</Panel>
					{comments.length > 0 && <CommentList icon="rate_review" title="Applying Your Comments" comments={comments} />}
				</div>
				<div className="lg:col-span-7 space-y-space-lg">
					<DiscoveryPanel analysis={analysis} progress={complete ? 1 : progress} live />
					<Panel icon="terminal" iconClass="text-secondary" title="Analysis Log">
						<ul className="bg-surface-container-lowest rounded-lg p-space-sm space-y-1 font-code-snippet text-label-sm text-on-surface-variant overflow-x-auto">
							{lines.map((l, i) => <li key={`${i}-${l}`} className="whitespace-nowrap">{l}</li>)}
						</ul>
					</Panel>
				</div>
			</div>
		</>
	);
}

/** Reviewer comments, each with the artifact and line it is on. */
function CommentList({ icon, title, comments }: { icon: string; title: string; comments: readonly ReviewComment[] }) {
	return (
		<Panel icon={icon} iconClass="text-secondary" title={title}>
			<ul className="space-y-space-xs" data-testid="review-comments">
				{comments.map(c => (
					<li key={c.id} className="text-body-sm font-body-sm text-on-surface-variant">
						<span className="text-outline">{c.artifact} · Line {c.line}:</span> {c.text} <span className="text-outline">({c.author})</span>
					</li>
				))}
			</ul>
		</Panel>
	);
}

function Done({ analysis, project, onRerun }: { analysis: AnalysisResult; project: Project; onRerun: () => void }) {
	const { artifacts } = useServices();
	const { go, setAnalyzeRerunComments } = useMigration();
	const { comments } = useReviewComments(project);
	const [rerunError, setRerunError] = useState<string>();
	// Sends the pending comments along with a fresh run, then marks them sent so they are not offered twice.
	const rerunWithComments = async () => {
		setRerunError(undefined);
		try {
			// Read them again: the polled list can be a few seconds behind a comment that was just added.
			const pending = await artifacts.getComments(project);
			if (pending.length === 0) {
				return;
			}
			await artifacts.markCommentsSent(project, pending.map(c => c.id));
			setAnalyzeRerunComments(pending);
			go('analyze');
		} catch (error) {
			setRerunError(error instanceof Error ? error.message : 'Could not re-run with the comments.');
		}
	};
	// The IDE's artifact preview offers the same action.
	const rerunRef = useRef(rerunWithComments);
	rerunRef.current = rerunWithComments;
	useEffect(() => {
		const onRerun = () => {
			void rerunRef.current();
		};
		window.addEventListener(RERUN_WITH_COMMENTS_EVENT, onRerun);
		return () => window.removeEventListener(RERUN_WITH_COMMENTS_EVENT, onRerun);
	}, []);
	const countFor = (artifact: ArtifactRef) => comments.filter(c => c.artifact === artifact.path.split('/').pop()).length;
	const [openError, setOpenError] = useState<string>();
	// Writes the artifact to disk, then asks the IDE to open it (markdown also gets a side preview).
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
				step={0}
				title="Source Codebase Analysis Results"
				description="Abstract syntax tree extraction, static reference extraction and assembly mapping are complete. Review the components and risk scores before choosing a migration approach."
				badge={<Badge className="bg-tertiary/15 text-tertiary">Analysis finished ({analysis.duration}) · {analysis.errors} errors</Badge>}
				actions={(
						<>
							{comments.length > 0 && <Button variant="primary" icon="rate_review" onClick={() => void rerunWithComments()}>Re-run with Comments ({comments.length})</Button>}
							<Button icon="replay" onClick={onRerun}>Re-run Analysis</Button>
						</>
					)}
			/>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
				<div className="lg:col-span-5 space-y-space-lg">
					<Panel icon="checklist" title="Tasks" badge={<span className="font-label-md text-label-md text-on-surface-variant">{analysis.tasks.length} of {analysis.tasks.length}</span>}>
						<ProgressBar pct={100} tone="bg-tertiary" />
						<TaskList tasks={toTasks(analysis.tasks, 1, true)} />
					</Panel>
					<Panel icon="description" iconClass="text-secondary" title="Generated Migration Artifacts">
						<div className="space-y-space-sm">
							{analysis.artifacts.map(a => <ArtifactCard key={a.id} icon={a.icon} name={a.name} meta={a.meta} commentCount={countFor(a)} onOpen={isEmbedded() ? () => void openArtifact(a) : undefined} />)}
						</div>
						{openError && <p className="mt-space-sm text-label-sm font-label-sm text-error">{openError}</p>}
						{rerunError && <p className="mt-space-sm text-label-sm font-label-sm text-error">{rerunError}</p>}
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


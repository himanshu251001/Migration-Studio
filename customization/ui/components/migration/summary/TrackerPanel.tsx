'use client';

import { useRef, useState } from 'react';
import { Button, Icon, Panel } from '@/components/ui';
import type { BacklogMilestone } from '@/features/migration/stories';
import { TRACKERS, type TrackerProvider, type TrackerPushResult } from '@/features/migration/tracker';
import { useServices } from '@/services/ServiceProvider';
import { FIELD } from './fields';

type PushState =
	| { kind: 'idle' }
	| { kind: 'confirm' }
	| { kind: 'pushing' }
	| { kind: 'done'; result: TrackerPushResult }
	| { kind: 'error'; message: string };

/** Pushes the plan to an issue tracker. The token lives in this component's state only: never persisted, cleared after a push. */
export function TrackerPanel({ plan, onPushed }: { plan: readonly BacklogMilestone[]; onPushed: () => void }) {
	const { tracker } = useServices();
	const [provider, setProvider] = useState<TrackerProvider>('github');
	const [target, setTarget] = useState('');
	const [token, setToken] = useState('');
	const [state, setState] = useState<PushState>({ kind: 'idle' });
	const abort = useRef<AbortController | undefined>(undefined);
	const option = TRACKERS.find(t => t.id === provider)!;
	const stories = plan.reduce((n, m) => n + m.stories.length, 0);
	const valid = option.available && option.targetPattern.test(target.trim()) && token.trim().length > 0;

	const push = async () => {
		abort.current = new AbortController();
		setState({ kind: 'pushing' });
		try {
			const result = await tracker.push({ provider, target: target.trim(), token: token.trim(), plan }, abort.current.signal);
			setToken('');
			setState({ kind: 'done', result });
			onPushed();
		} catch (e) {
			setState({ kind: 'error', message: e instanceof Error ? e.message : 'Push failed.' });
		}
	};

	return (
		<Panel icon="bug_report" iconClass="text-secondary" title="Push to an issue tracker">
			<p className="text-body-sm font-body-sm text-on-surface-variant">Creates {plan.length} milestones (as GitHub milestones) and {stories} stories with acceptance criteria and tasks. The token is sent only with this request and is not stored.</p>
			<div className="flex flex-wrap gap-space-sm" role="radiogroup" aria-label="Issue tracker">
				{TRACKERS.map(t => (
					<Button key={t.id} role="radio" aria-checked={t.id === provider} variant="secondary" disabled={!t.available} title={t.available ? undefined : 'Coming soon'}
						className={t.id === provider ? 'ring-1 ring-primary text-primary' : ''} onClick={() => { setProvider(t.id); setState({ kind: 'idle' }); }}>
						{t.label}{!t.available && ' (soon)'}
					</Button>
				))}
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
				<input aria-label={option.targetLabel} className={FIELD} value={target} onChange={e => setTarget(e.target.value)} placeholder={option.targetPlaceholder} autoComplete="off" spellCheck={false} />
				<input aria-label="API token" type="password" className={FIELD} value={token} onChange={e => setToken(e.target.value)} placeholder="API token" autoComplete="off" />
			</div>
			{state.kind === 'confirm' ? (
				<div className="flex flex-wrap items-center gap-space-sm rounded-lg bg-surface-container-high p-space-sm text-body-sm font-body-sm">
					<span>Will create {plan.length} milestones and {stories} stories in {target.trim()}. Items already pushed are skipped.</span>
					<Button variant="primary" icon="publish" onClick={() => void push()}>Confirm push</Button>
					<Button variant="ghost" onClick={() => setState({ kind: 'idle' })}>Cancel</Button>
				</div>
			) : (
				<Button variant="primary" icon="publish" disabled={!valid || state.kind === 'pushing'} onClick={() => setState({ kind: 'confirm' })}>
					{state.kind === 'pushing' ? 'Pushing...' : `Push to ${option.label}`}
				</Button>
			)}
			{state.kind === 'done' && (
				<div className="rounded-lg bg-tertiary/10 p-space-sm space-y-space-xs text-body-sm font-body-sm text-tertiary">
					<div className="flex items-center gap-space-xs font-medium"><Icon name="check_circle" className="text-[16px]" /> {state.result.milestones.length} milestones and {state.result.stories.length} stories in the tracker{state.result.failures.length > 0 && `, ${state.result.failures.length} failed`}.</div>
					<ul className="max-h-40 overflow-y-auto space-y-0.5">
						{[...state.result.milestones, ...state.result.stories].map(i => (
							<li key={i.id}><a href={i.url} target="_blank" rel="noreferrer" className="underline">{i.id}</a> {i.title}{i.existing && ' (already existed)'}</li>
						))}
					</ul>
					{state.result.failures.map(f => <div key={f.id} className="text-error">{f.id}: {f.message}</div>)}
				</div>
			)}
			{state.kind === 'error' && (
				<div className="flex items-start gap-space-xs rounded-lg bg-error-container/20 p-space-sm text-body-sm font-body-sm text-error"><Icon name="error" className="text-[16px] shrink-0" /> {state.message}</div>
			)}
		</Panel>
	);
}

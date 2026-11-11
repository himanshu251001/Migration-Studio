'use client';

import { useState } from 'react';
import { Badge, Button, Icon, Modal } from '@/components/ui';
import type { ScopeGap } from '@/features/migration/scope';

/** Walks through the gaps one at a time and records how the reviewer resolves each. */
export function GapModal({ gaps, resolutions, start, onResolve, onClose }: {
	gaps: readonly ScopeGap[];
	resolutions: Readonly<Record<string, string>>;
	start: number;
	onResolve: (gapId: string, resolution: string) => void;
	onClose: () => void;
}) {
	const [index, setIndex] = useState(start);
	const [other, setOther] = useState('');
	const gap = gaps[index];
	const resolved = Object.keys(resolutions).length;
	const picked = resolutions[gap.id];
	return (
		<Modal title={`Gap ${index + 1} of ${gaps.length}`} onClose={onClose} wide>
			<div className="space-y-space-md">
				<div className="space-y-1">
					<div className="text-label-md font-label-md text-outline">{gap.id} · {gap.area}</div>
					<h3 className="text-headline-sm font-headline-sm">{gap.title}</h3>
					<div className="flex flex-wrap items-center gap-space-sm">
						<Badge className={gap.risk === 'High' ? 'bg-error-container/20 text-error' : 'bg-primary/10 text-primary'}>{gap.risk} risk</Badge>
						<span className="text-label-md font-label-md text-on-surface-variant">{gap.effort} effort</span>
						<span className="text-label-sm font-label-sm text-outline">UI parity: {gap.uiParity} · Functional parity: {gap.functionalParity}</span>
					</div>
					<div className="text-label-sm font-label-sm text-on-surface-variant">{resolved} / {gaps.length} resolved</div>
				</div>
				<div className="rounded-lg border border-outline-variant/40 p-space-sm space-y-1">
					<div className="text-label-sm font-label-sm uppercase text-outline">What exists today</div>
					<p className="text-body-md font-body-md">{gap.exists}</p>
				</div>
				<div className="rounded-lg border border-primary/40 bg-primary/10 p-space-sm space-y-1">
					<div className="text-label-sm font-label-sm uppercase text-outline">What is needed</div>
					<p className="text-body-md font-body-md">{gap.needed}</p>
				</div>
				<div className="text-body-md font-body-md">How should this be resolved?</div>
				<div className="rounded-lg border border-outline-variant/40 divide-y divide-outline-variant/40">
					{gap.options.map(o => (
						<button key={o.title} type="button" onClick={() => onResolve(gap.id, o.title)} className={`w-full flex items-start gap-space-sm p-space-sm text-left hover:bg-surface-container-high ${picked === o.title ? 'bg-primary/10' : ''}`}>
							<Icon name={picked === o.title ? 'radio_button_checked' : 'radio_button_unchecked'} className={`text-[20px] ${picked === o.title ? 'text-primary' : 'text-outline'}`} />
							<span className="min-w-0">
								<span className="text-body-md font-body-md">{o.title}</span>
								{o.recommended && <Badge className="ml-space-sm bg-tertiary/15 text-tertiary">Recommended</Badge>}
								<span className="block text-label-sm font-label-sm text-on-surface-variant">{o.description}</span>
							</span>
						</button>
					))}
					<div className="p-space-sm space-y-space-xs">
						<div className="text-body-md font-body-md">Other: describe your own resolution</div>
						<textarea
							value={other}
							onChange={e => setOther(e.target.value)}
							placeholder="How will this be resolved?"
							rows={2}
							className="w-full rounded border border-outline-variant/40 bg-surface-container-low px-space-sm py-2 text-body-sm font-body-sm text-on-surface outline-none focus:border-primary"
						/>
						<Button disabled={!other.trim()} onClick={() => { onResolve(gap.id, other.trim()); setOther(''); }}>Use This Resolution</Button>
					</div>
				</div>
				<div className="flex items-center justify-between">
					<Button icon="arrow_back" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
					<Button disabled={index === gaps.length - 1} onClick={() => setIndex(index + 1)}>Next</Button>
				</div>
			</div>
		</Modal>
	);
}

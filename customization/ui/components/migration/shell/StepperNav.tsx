'use client';

import { Icon } from '@/components/ui';
import { screenDef, STEP_DEFS, stepState, stepTarget, type ScreenKey, type StepState } from '@/features/migration/steps';
import { useMigration } from '@/state/MigrationProvider';

const TAG: Record<StepState, string> = { done: 'DONE', active: 'RUNNING', next: 'NEXT STEP', locked: 'Awaiting' };
const PROGRESS: Record<StepState, string> = { done: '100%', active: '50%', next: '4%', locked: '0%' };

/** Horizontal workflow stepper. Reached steps are clickable and jump to their latest screen. */
export function StepperNav({ screen }: { screen: ScreenKey }) {
	const { reached, go } = useMigration();
	const current = screenDef(screen);

	return (
		<nav aria-label="Workflow" className="w-full">
			<ol className="flex gap-space-sm overflow-x-auto p-1">
				{STEP_DEFS.map((step, i) => {
					const state = stepState(current, i, reached);
					const target = stepTarget(i, reached);
					const isCurrent = target === screen;
					const clickable = !!target && !isCurrent;
					const highlighted = state === 'active' || state === 'next' || isCurrent;
					return (
						<li key={step.slug} className="w-[184px] shrink-0">
							<button
								disabled={!clickable}
								onClick={() => target && go(target)}
								aria-current={state === 'active' || isCurrent ? 'step' : undefined}
								title={step.label}
								className={`w-full h-full flex flex-col gap-space-md text-left rounded-lg p-space-md transition-colors ${highlighted ? 'bg-surface-container-high' : 'bg-surface-container-low'} ${state === 'active' || state === 'next' ? 'ring-2 ring-primary' : ''} ${clickable ? 'cursor-pointer hover:bg-surface-container-high' : 'cursor-default'}`}
							>
								<div className="flex items-start justify-between gap-space-xs">
									<span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[15px] font-semibold ${state === 'done' ? 'bg-primary text-on-primary' : state === 'active' || state === 'next' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-outline'}`}>
										{state === 'done' ? <Icon name="check" className="text-[20px]" /> : i + 1}
									</span>
									{state === 'active' && <Icon name="progress_activity" className="text-[20px] text-primary animate-spin" />}
									{state === 'locked' && <Icon name="lock" className="text-[18px] text-outline" />}
								</div>
								<div className="space-y-space-xs min-w-0">
									<div className={`text-[15px] font-semibold leading-tight ${state === 'locked' ? 'text-outline' : 'text-on-surface'}`}>{step.short}</div>
									<div className={`text-[12px] font-medium uppercase tracking-wider ${state === 'next' || state === 'active' ? 'text-primary' : state === 'done' ? 'text-tertiary' : 'text-outline'}`}>{TAG[state]}</div>
									<div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
										<div className="h-full rounded-full bg-primary transition-all" style={{ width: PROGRESS[state] }} />
									</div>
								</div>
							</button>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

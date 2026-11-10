import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { STEP_DEFS } from '@/features/migration/steps';
import { useStepActionsSlot } from './StepNav';

/** Title block shared by step screens: step counter, title, description, status badge and header actions. */
export function StepHeader({ step, title, description, badge, actions }: {
	/** Zero based index into STEP_DEFS. */
	step: number;
	title: string;
	description: string;
	badge: ReactNode;
	actions?: ReactNode;
}) {
	const slot = useStepActionsSlot();
	return (
		<div className="flex flex-col md:flex-row md:items-start justify-between gap-space-md">
			<div className="space-y-space-xs min-w-0">
				<div className="text-label-sm font-label-sm uppercase tracking-wider text-outline">Step {step + 1} of {STEP_DEFS.length}</div>
				<h2 className="font-headline-lg text-headline-lg">{title}</h2>
				<p className="text-body-md font-body-md text-on-surface-variant max-w-3xl">{description}</p>
				<div>{badge}</div>
			</div>
			{actions && slot && createPortal(actions, slot)}
		</div>
	);
}

import type { ReactNode } from 'react';
import { Icon } from './Icon';

const TONES = {
	primary: 'bg-primary/10 text-primary',
	secondary: 'bg-secondary-container/20 text-secondary',
	error: 'bg-error-container/20 text-error',
	tertiary: 'bg-tertiary/10 text-tertiary'
} as const;

export function Metric({ icon, value, label, tone = 'primary' }: {
	icon: string;
	value: ReactNode;
	label: string;
	tone?: keyof typeof TONES;
}) {
	return (
		<div className="bg-surface-container p-space-sm rounded-lg flex items-center gap-space-sm">
			<div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${TONES[tone]}`}>
				<Icon name={icon} className="text-[18px]" />
			</div>
			<div className="min-w-0">
				<div className="font-headline-sm text-headline-sm text-on-surface">{value}</div>
				<div className="font-label-sm text-label-sm text-outline truncate">{label}</div>
			</div>
		</div>
	);
}

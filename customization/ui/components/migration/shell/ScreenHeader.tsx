import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';

/** Project title row with an optional breadcrumb trail, status badges and actions. */
export function ScreenHeader({ title, badges, trail, actions }: {
	title: string;
	badges?: ReactNode;
	trail?: readonly string[];
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
			<div className="space-y-space-xs min-w-0">
				<div className="flex items-center gap-space-sm flex-wrap">
					<h1 className="font-headline-xl text-headline-xl tracking-tight">{title}</h1>
					{badges}
				</div>
				{trail && (
					<div className="flex items-center gap-space-xs text-body-sm font-body-sm text-outline flex-wrap">
						{trail.map((t, i) => (
							<span key={t} className="flex items-center gap-space-xs">
								{i > 0 && <Icon name="chevron_right" className="text-[13px]" />}
								<span className={i === trail.length - 1 ? 'text-on-surface-variant' : ''}>{t}</span>
							</span>
						))}
					</div>
				)}
			</div>
			{actions && <div className="flex items-center gap-space-sm shrink-0">{actions}</div>}
		</div>
	);
}

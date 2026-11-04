import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** A titled card section. */
export function Panel({ icon, iconClass = 'text-primary', title, badge, children }: {
	icon: string;
	iconClass?: string;
	title: string;
	badge?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="bg-surface-container-low rounded-xl p-space-md shadow-sm space-y-space-md">
			<div className="flex items-center justify-between gap-space-sm">
				<div className="flex items-center gap-space-xs min-w-0">
					<Icon name={icon} className={`${iconClass} text-[18px]`} />
					<h3 className="font-headline-md text-headline-md text-on-surface truncate">{title}</h3>
				</div>
				{badge}
			</div>
			{children}
		</section>
	);
}

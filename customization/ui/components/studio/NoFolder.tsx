import { Icon } from '@/components/ui';

/** Shown when the IDE has no folder open, so there is nothing to detect projects in. */
export function NoFolder({ compact = false }: { compact?: boolean }) {
	return (
		<div className={`text-center space-y-space-sm ${compact ? 'py-space-md' : 'py-space-xl'}`}>
			<Icon name="folder_off" className="text-[40px] text-secondary" />
			<h1 className="font-headline-sm text-headline-sm">No folder opened</h1>
			<p className="text-body-sm text-on-surface-variant">Open a folder or repository in the IDE and Migration Studio will detect its projects.</p>
		</div>
	);
}

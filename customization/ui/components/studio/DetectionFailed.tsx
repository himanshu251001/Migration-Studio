import { Icon } from '@/components/ui';

export function DetectionFailed({ error }: { error: string }) {
	return (
		<div className="text-center space-y-space-sm py-space-lg">
			<Icon name="error" className="text-[32px] text-error" />
			<h1 className="font-headline-sm text-headline-sm">Could not detect projects</h1>
			<p className="text-body-sm text-on-surface-variant break-words">{error}</p>
		</div>
	);
}

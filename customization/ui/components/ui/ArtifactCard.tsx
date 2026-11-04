import { Icon } from './Icon';

/** A generated file. Not openable yet: the artifact viewer is built when a later step needs it. */
export function ArtifactCard({ icon, name, meta }: { icon: string; name: string; meta: string }) {
	return (
		<div className="flex items-center gap-space-sm bg-surface-container rounded-lg p-space-sm">
			<div className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
				<Icon name={icon} className="text-[18px]" />
			</div>
			<div className="min-w-0">
				<div className="font-body-sm text-body-sm text-on-surface truncate">{name}</div>
				<div className="font-label-sm text-label-sm text-outline truncate">{meta}</div>
			</div>
		</div>
	);
}

import { Icon } from './Icon';

/** A generated file. Clickable when `onOpen` is given, which opens it in the IDE. */
export function ArtifactCard({ icon, name, meta, onOpen, commentCount = 0 }: { icon: string; name: string; meta: string; onOpen?: () => void; commentCount?: number }) {
	const Tag = onOpen ? 'button' : 'div';
	return (
		<Tag
			type={onOpen ? 'button' : undefined}
			onClick={onOpen}
			title={onOpen ? 'Open in editor' : undefined}
			className={`flex items-center gap-space-sm bg-surface-container rounded-lg p-space-sm w-full text-left ${onOpen ? 'cursor-pointer hover:bg-surface-container-high' : ''}`}
		>
			<div className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
				<Icon name={icon} className="text-[18px]" />
			</div>
			<div className="min-w-0">
				<div className="font-body-sm text-body-sm text-on-surface truncate">{name}</div>
				<div className="font-label-sm text-label-sm text-outline truncate">{meta}</div>
			</div>
		</Tag>
	);
}

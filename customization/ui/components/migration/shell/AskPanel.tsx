'use client';

import { Icon } from '@/components/ui';

/** Right-hand drawer for asking questions about the current page. Placeholder until the AI backend exists. */
export function AskPanel({ title, onClose }: { title: string; onClose: () => void }) {
	return (
		<aside
			role="dialog"
			aria-label={`Ask about ${title}`}
			className="fixed top-0 right-0 bottom-0 z-40 w-full max-w-sm flex flex-col bg-surface-container border-l border-outline-variant/40 shadow-xl"
		>
			<div className="flex items-center justify-between px-space-md py-space-sm border-b border-outline-variant/40">
				<div className="flex items-center gap-space-xs text-body-md font-body-md font-medium">
					<Icon name="forum" className="text-[20px] text-on-surface-variant" /> Ask about {title}
				</div>
				<button type="button" onClick={onClose} aria-label="Close" className="text-on-surface-variant hover:text-on-surface">
					<Icon name="close" className="text-[22px]" />
				</button>
			</div>
			<div className="flex-1 overflow-y-auto p-space-md space-y-space-xs text-body-md font-body-md text-on-surface-variant">
				<p>Ask a question about this page.</p>
				<p className="text-label-sm font-label-sm text-outline">Coming soon: asking questions needs the AI backend.</p>
			</div>
			<div className="flex items-center gap-space-xs p-space-sm border-t border-outline-variant/40">
				<input
					disabled
					placeholder="Ask a question..."
					aria-label="Question"
					className="flex-1 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-space-sm py-2 text-body-md font-body-md outline-none disabled:opacity-60"
				/>
				<button type="button" disabled aria-label="Send" className="rounded-lg bg-primary-container text-on-primary-container px-space-sm py-2 disabled:opacity-40">
					<Icon name="send" className="text-[18px]" />
				</button>
			</div>
		</aside>
	);
}

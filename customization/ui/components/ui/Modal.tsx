'use client';

import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

/** A centered dialog. Closes on Escape or backdrop click. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-space-lg bg-surface-container-lowest/80" onClick={onClose}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				onClick={e => e.stopPropagation()}
				className={`w-full ${wide ? 'max-w-3xl' : 'max-w-2xl'} max-h-full overflow-y-auto bg-surface-container rounded-xl border border-outline-variant shadow-lg`}
			>
				<div className="flex items-center justify-between p-space-md border-b border-outline-variant/40">
					<h2 className="font-headline-md text-headline-md">{title}</h2>
					<button aria-label="Close" onClick={onClose} className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant">
						<Icon name="close" className="text-[18px]" />
					</button>
				</div>
				<div className="p-space-md">{children}</div>
			</div>
		</div>
	);
}

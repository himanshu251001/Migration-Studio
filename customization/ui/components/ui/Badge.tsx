import type { ReactNode } from 'react';

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
	return <span className={`px-2 py-0.5 rounded text-label-sm font-label-sm uppercase ${className}`}>{children}</span>;
}

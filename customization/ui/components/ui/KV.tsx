import type { ReactNode } from 'react';

/** Zebra-striped key/value rows. */
export function KV({ rows }: { rows: readonly { k: string; v: ReactNode }[] }) {
	return (
		<div className="bg-surface-container rounded-lg overflow-hidden font-body-sm text-body-sm">
			{rows.map((r, i) => (
				<div key={r.k} className={`grid grid-cols-3 p-space-sm items-center ${i % 2 === 0 ? 'bg-surface-container-high/40' : ''}`}>
					<span className="text-outline font-label-sm text-label-sm uppercase">{r.k}</span>
					<div className="col-span-2 text-on-surface min-w-0">{r.v}</div>
				</div>
			))}
		</div>
	);
}

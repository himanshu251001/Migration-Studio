export function ProgressBar({ pct, tone = 'bg-primary' }: { pct: number; tone?: string }) {
	return (
		<div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="w-full bg-surface-container-lowest h-1.5 rounded overflow-hidden">
			<div className={`${tone} h-full transition-all duration-300 ease-out`} style={{ width: `${pct}%` }} />
		</div>
	);
}

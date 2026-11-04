import { Badge, KV, Metric, Panel } from '@/components/ui';
import type { AnalysisResult, DiscoveryTone } from '@/features/migration/analyze';

const TONES: Record<DiscoveryTone, string> = {
	neutral: 'bg-surface-container-highest text-on-surface-variant',
	warning: 'bg-surface-container-highest text-secondary',
	danger: 'bg-error-container/30 text-error'
};

function format(n: number): string {
	return n.toLocaleString('en-US');
}

/** Discovery summary and counters. `progress` scales the counters while the analysis runs. */
export function DiscoveryPanel({ analysis, progress, live }: { analysis: AnalysisResult; progress: number; live: boolean }) {
	const { metrics } = analysis;
	return (
		<Panel
			icon="grid_view"
			iconClass="text-secondary"
			title="Discovery Summary"
			badge={<Badge className="bg-surface-container text-secondary">{live ? 'Live' : 'Verified'}</Badge>}
		>
			<KV rows={analysis.discovery.map(r => ({
				k: r.key,
				v: r.tone ? <Badge className={TONES[r.tone]}>{r.value}</Badge> : r.value
			}))} />
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
				<Metric icon="description" value={format(Math.round(progress * metrics.filesScanned))} label="Files Scanned" />
				<Metric icon="view_in_ar" value={Math.round(progress * metrics.components)} label="Components" tone="secondary" />
				<Metric icon="report_problem" value={Math.round(progress * metrics.risks)} label="Potential Risks" tone="error" />
			</div>
		</Panel>
	);
}

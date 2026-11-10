import type { AnalyzeTask } from './analyze';

export type Level = 'High' | 'Medium' | 'Low';

/** A business capability found in the codebase. */
export interface Capability {
	readonly id: string;
	readonly name: string;
	readonly frequency: Level;
	readonly criticality: Level;
	readonly persona: string;
	/** Shown once the reviewer has generated the deep analysis, e.g. "3 entry points, 2 data stores". */
	readonly analysisSummary: string;
}

/** Capabilities grouped under one domain, per the locked decomposition strategy. */
export interface IndexDomain {
	readonly name: string;
	readonly capabilities: readonly Capability[];
}

export interface IndexMetrics {
	readonly components: number;
	readonly filesLinked: number;
}

/** Everything the Index step shows. Counts in `metrics` are final values; the running view scales them by progress. */
export interface IndexResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	readonly metrics: IndexMetrics;
	/** Component counts by kind, shown on the done screen. */
	readonly breakdown: readonly { readonly label: string; readonly value: string }[];
	readonly domains: readonly IndexDomain[];
	readonly duration: string;
}

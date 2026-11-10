/** One task of the analysis run. */
export interface AnalyzeTask {
	readonly label: string;
	readonly description: string;
	/** When set, the active task shows `n / total` units processed. */
	readonly total?: number;
	/** Summary shown once the task has finished. */
	readonly doneMeta: string;
}

export type DiscoveryTone = 'neutral' | 'warning' | 'danger';

export interface DiscoveryRow {
	readonly key: string;
	readonly value: string;
	/** Renders the value as a badge in this tone. */
	readonly tone?: DiscoveryTone;
}

export interface AnalyzeMetrics {
	readonly filesScanned: number;
	readonly components: number;
	readonly risks: number;
}

/** A file produced by the analysis. */
export interface ArtifactRef {
	readonly id: string;
	readonly name: string;
	readonly meta: string;
	readonly icon: string;
	/** File name inside the project's artifact folder (`<dest>/.migration/artifacts/`). */
	readonly path: string;
	/** Text content written to `path` when the artifact is opened. */
	readonly content: string;
}

/** Everything the Analyze step shows. Counts in `metrics` are final values; the running view scales them by progress. */
export interface AnalysisResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	/** Rows of the discovery summary. */
	readonly discovery: readonly DiscoveryRow[];
	readonly metrics: AnalyzeMetrics;
	/** Blockers and debt flags explained in prose. */
	readonly blockers: string;
	readonly artifacts: readonly ArtifactRef[];
	/** Human readable run time, e.g. "2m 14s". */
	readonly duration: string;
	readonly errors: number;
}

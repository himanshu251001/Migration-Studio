import type { AnalyzeTask } from './analyze';

/** One source technology and the target technology it maps to. */
export interface TargetMapping {
	/** Category, unique within the result, e.g. "auth-mechanism". */
	readonly id: string;
	readonly legacy: string;
	readonly target: string;
	/** One sentence explaining the mapping. */
	readonly text: string;
}

/** Everything the Target step shows. */
export interface TargetResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	/** Name of the source stack, e.g. "Express.js API service". */
	readonly source: string;
	readonly mappings: readonly TargetMapping[];
	readonly duration: string;
}

/** The mappings the reviewer has approved. */
export interface TargetDecision {
	/** Ids of approved mappings. */
	readonly approved: readonly string[];
}

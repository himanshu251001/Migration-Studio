import type { AnalyzeTask } from './analyze';

/** One tile of the rollout strategy; opens a list of bullet points. */
export interface RolloutCard {
	/** Unique within the result, e.g. "topology". */
	readonly id: string;
	readonly title: string;
	/** Short summary shown on the tile, e.g. "2 modules". */
	readonly sub: string;
	readonly bullets: readonly string[];
}

/** Everything the Rollout step shows. */
export interface RolloutResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	readonly modules: number;
	readonly waves: number;
	readonly decisions: number;
	/** Open items the reviewer should confirm during later planning. */
	readonly attention: readonly string[];
	readonly cards: readonly RolloutCard[];
	readonly duration: string;
}

/** The reviewer's sign-off on the strategy. */
export interface RolloutDecision {
	readonly locked: boolean;
}

import type { AnalyzeTask } from './analyze';

/** One drafted milestone. */
export interface Milestone {
	/** Unique within the result, e.g. "M-01". */
	readonly id: string;
	readonly name: string;
	/** T-shirt size: S, M or L. */
	readonly size: string;
	/** What the milestone covers, e.g. "Authentication." */
	readonly covers: string;
}

/** Everything the Milestones step shows. */
export interface MilestonesResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	readonly milestones: readonly Milestone[];
	/** Lines the optional deep analysis of a milestone reports, in order. `{name}` stands for the milestone name. */
	readonly analysisLogs: readonly string[];
	readonly duration: string;
}

/** The reviewer's edits and sign-off. */
export interface MilestonesDecision {
	/** Renamed milestones by id; absent ids keep their drafted name. */
	readonly names: Readonly<Record<string, string>>;
	readonly locked: boolean;
}

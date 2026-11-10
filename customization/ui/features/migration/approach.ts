import type { AnalyzeTask } from './analyze';

export type Suitability = 'High' | 'Medium' | 'Low';

/** A decomposition strategy the planner evaluated. */
export interface ApproachOption {
	readonly id: string;
	readonly name: string;
	readonly suitability: Suitability;
	/** 0..100 weighted score, shown while the planner runs. */
	readonly score: number;
	/** The planner's pick. */
	readonly recommended: boolean;
	readonly when: string;
}

export interface ApproachBoundary {
	readonly name: string;
	readonly risk: Suitability;
	readonly description: string;
}

export interface ApproachRisk {
	readonly level: 'High' | 'Medium' | 'Low';
	readonly text: string;
	readonly mitigation: string;
}

/** Everything the Approach step shows. */
export interface ApproachResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	readonly options: readonly ApproachOption[];
	/** Pattern name of the recommended option, e.g. "Capability-Based". */
	readonly pattern: string;
	readonly rationale: string;
	readonly boundaries: readonly ApproachBoundary[];
	readonly risks: readonly ApproachRisk[];
	readonly duration: string;
}

/** The reviewer's locked choice: one of the option ids, or a custom strategy. */
export interface ApproachDecision {
	readonly optionId: string | 'other';
	/** Free text, only for `other`. */
	readonly custom?: string;
}

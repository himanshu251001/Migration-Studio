import type { AnalyzeTask } from './analyze';

/** A modernization goal and how its success is checked. Reference only. */
export interface ScopeGoal {
	readonly title: string;
	readonly description: string;
	readonly success: string;
}

/** A target stack the planner proposes. */
export interface StackCandidate {
	readonly id: string;
	readonly name: string;
	readonly architecture: string;
	readonly description: string;
	readonly tradeoff: string;
}

/** One way to resolve a gap. */
export interface GapOption {
	readonly title: string;
	readonly description: string;
	readonly recommended: boolean;
}

/** Something the legacy code does that the chosen target stack does not cover yet. */
export interface ScopeGap {
	readonly id: string;
	readonly area: string;
	readonly title: string;
	readonly risk: 'High' | 'Medium' | 'Low';
	readonly effort: string;
	readonly uiParity: string;
	readonly functionalParity: string;
	readonly exists: string;
	readonly needed: string;
	readonly options: readonly GapOption[];
}

export interface ScopeItem {
	readonly title: string;
	readonly description: string;
}

/** A tile that opens a list of items: in scope, out of scope, success criteria, governance. */
export interface ScopeSection {
	readonly id: string;
	readonly title: string;
	/** Short summary shown on the tile, e.g. "5 items". */
	readonly summary: string;
	readonly items: readonly ScopeItem[];
}

/** Everything the Scope step shows. */
export interface ScopeResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	readonly goals: readonly ScopeGoal[];
	readonly stacks: readonly StackCandidate[];
	readonly databases: readonly string[];
	readonly strategies: readonly string[];
	readonly gaps: readonly ScopeGap[];
	/** Whether the gaps were analyzed for the current stack, database and strategy. False until the reviewer runs the gap analysis, and again whenever the selection changes. */
	readonly gapsReady: boolean;
	readonly sections: readonly ScopeSection[];
	readonly duration: string;
}

/** The reviewer's choices so far. `locked` is set once the target stack is locked. */
export interface ScopeDecision {
	/** A stack candidate id, or 'other' with `customStack`. */
	readonly stack?: string;
	readonly customStack?: string;
	readonly database: string;
	readonly strategy: string;
	/** Chosen resolution text per gap id. */
	readonly resolutions: Readonly<Record<string, string>>;
	readonly locked: boolean;
}

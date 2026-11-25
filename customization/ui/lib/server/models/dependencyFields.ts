import { Schema } from 'mongoose';

/** The result of the dependency analysis, stored on each migration unit and shared service. */
export interface DependencyFields {
	/** `null` until the analysis ran. A number is the execution wave; `blocked` means it sits in a cycle. */
	wave: number | 'blocked' | null;
	readinessScore: 'High' | 'Medium' | 'Low' | null;
	readinessJustification: string;
	/** Whether Claude assessed the readiness or the deterministic rule did. */
	readinessSource: 'claude' | 'heuristic' | null;
	upstreamDependencies: { name: string; reason: string; isHardBlocker: boolean }[];
	downstreamDependents: { name: string; reason: string }[];
	migrationBlockers: { blocker: string; origin: string; prerequisiteAction: string }[];
}

/** Mongoose definition of {@link DependencyFields}, shared by both models. */
export const dependencyFieldsDefinition = {
	wave: { type: Schema.Types.Mixed, default: null },
	readinessScore: { type: String, enum: ['High', 'Medium', 'Low', null], default: null },
	readinessJustification: { type: String, default: '' },
	readinessSource: { type: String, enum: ['claude', 'heuristic', null], default: null },
	upstreamDependencies: { type: [{ _id: false, name: String, reason: String, isHardBlocker: Boolean }], default: [] },
	downstreamDependents: { type: [{ _id: false, name: String, reason: String }], default: [] },
	migrationBlockers: { type: [{ _id: false, blocker: String, origin: String, prerequisiteAction: String }], default: [] }
};

/** The values of a unit or service the analysis has not touched. */
export const NO_DEPENDENCY_RESULT: DependencyFields = {
	wave: null, readinessScore: null, readinessJustification: '', readinessSource: null, upstreamDependencies: [], downstreamDependents: [], migrationBlockers: []
};

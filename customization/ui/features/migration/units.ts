import type { AnalyzeTask, ArtifactRef } from './analyze';

export type UnitSize = 'Small' | 'Medium' | 'Large';

/** A self-contained group of components that is migrated and released together. */
export interface MigrationUnit {
	readonly id: string;
	readonly name: string;
	readonly size: UnitSize;
	readonly domain: string;
	/** Capabilities the unit delivers, e.g. "Login, Session management". */
	readonly capabilities: string;
}

/** Everything the Units step shows. */
export interface UnitsResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	/** Units in the planner's suggested order. */
	readonly units: readonly MigrationUnit[];
	/** Components placed into units. */
	readonly componentsPlaced: number;
	readonly artifacts: readonly ArtifactRef[];
	readonly duration: string;
}

/** The reviewer's unit order and whether the catalog is locked. */
export interface UnitsDecision {
	/** Unit ids in the reviewer's order. */
	readonly order: readonly string[];
	readonly locked: boolean;
}

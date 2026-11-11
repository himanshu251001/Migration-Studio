import type { AnalyzeTask, ArtifactRef } from './analyze';

/** A unit placed in an execution wave, with the units it must wait for. */
export interface WaveUnit {
	readonly name: string;
	/** Names of the upstream units this unit depends on. Empty when it has none. */
	readonly needs: readonly string[];
}

/** Units that can be migrated in parallel once every earlier wave is done. */
export interface DependencyWave {
	readonly units: readonly WaveUnit[];
}

/** Everything the Dependencies step shows. */
export interface DependenciesResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	readonly waves: readonly DependencyWave[];
	readonly crossUnitEdges: number;
	readonly sharedResources: number;
	readonly circularRefs: number;
	/** The unit order that respects every dependency, e.g. "Shared Infrastructure → Authentication, Catalog". */
	readonly criticalPath: string;
	readonly artifacts: readonly ArtifactRef[];
	readonly duration: string;
}

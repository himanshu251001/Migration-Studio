import type { Project } from '@/features/migration/types';
import { deepAnalysisFile } from './capabilities';
import { Capability } from './models/Capability';
import { DecompositionStrategyReport } from './models/DecompositionStrategyReport';
import { MigrationUnit } from './models/MigrationUnit';
import { MigrationUnitCatalog } from './models/MigrationUnitCatalog';
import { NO_DEPENDENCY_RESULT } from './models/dependencyFields';
import { Run } from './models/Run';
import { SharedService } from './models/SharedService';
import { SubProjectAnalysis } from './models/SubProjectAnalysis';
import { removeProjectPath } from './projectWorkspace';

/**
 * Deletes the stored runs of `phase` (or of every phase starting with `phase:`), except the one that is starting now.
 * Pass no `currentRunId` when no run is starting, as when a reviewer clears a decision.
 */
async function deleteOldRuns(projectId: string, phase: string, currentRunId?: string): Promise<void> {
	const phases = { $in: [phase, new RegExp(`^${phase}:`)] };
	await Run.deleteMany({ projectId, phase: phases, ...(currentRunId ? { _id: { $ne: currentRunId } } : {}) });
}

/** Clears the Dependencies phase only: the analysis stored on the units and shared services, old runs and the file. */
export async function resetDependencies(project: Project, currentRunId?: string): Promise<void> {
	await MigrationUnit.updateMany({ projectId: project.id }, { $set: NO_DEPENDENCY_RESULT });
	await SharedService.updateMany({ projectId: project.id }, { $set: NO_DEPENDENCY_RESULT });
	await deleteOldRuns(project.id, 'dependencies', currentRunId);
	await removeProjectPath(project.dest, 'migration/dependency-analysis.md');
}

/** Clears the Units phase and the Dependencies built on it. */
export async function resetUnits(project: Project, currentRunId?: string): Promise<void> {
	await MigrationUnit.deleteMany({ projectId: project.id });
	await SharedService.deleteMany({ projectId: project.id });
	await MigrationUnitCatalog.deleteOne({ projectId: project.id });
	await deleteOldRuns(project.id, 'units', currentRunId);
	await removeProjectPath(project.dest, 'migration/migration-units-catalog.md');
	await resetDependencies(project, currentRunId);
}

/** Clears one capability's deep analysis, its old runs (except the one starting now) and its file; the capability stays. */
export async function resetDeepAnalysis(project: Project, capability: { seqNum: number; name: string }, currentRunId?: string): Promise<void> {
	await Capability.updateOne({ projectId: project.id, seqNum: capability.seqNum }, { $set: { deepAnalysis: null, deepAnalysisGeneratedAt: null } });
	await deleteOldRuns(project.id, `capability-analysis:cap-${capability.seqNum}`, currentRunId);
	await removeProjectPath(project.dest, deepAnalysisFile(capability.seqNum, capability.name));
}

/** Clears only the generated deep analyses of the capabilities (the capabilities stay). */
export async function resetDeepAnalyses(project: Project, currentRunId?: string): Promise<void> {
	await Capability.updateMany({ projectId: project.id }, { $set: { deepAnalysis: null, deepAnalysisGeneratedAt: null } });
	await deleteOldRuns(project.id, 'capability-analysis', currentRunId);
	await removeProjectPath(project.dest, 'migration/capabilities');
}

/** Clears the Index phase (capabilities and their deep analyses) and everything built on it. */
export async function resetIndex(project: Project, currentRunId?: string): Promise<void> {
	await Capability.deleteMany({ projectId: project.id });
	await deleteOldRuns(project.id, 'index', currentRunId);
	await deleteOldRuns(project.id, 'capability-analysis', currentRunId);
	await removeProjectPath(project.dest, 'migration/capability-index.md');
	await removeProjectPath(project.dest, 'migration/capabilities');
	await resetUnits(project, currentRunId);
}

/** Clears the Approach phase: its report (which holds the locked decision), old runs and the report file, and the Index built on it. */
export async function resetApproach(project: Project, currentRunId?: string): Promise<void> {
	await DecompositionStrategyReport.deleteOne({ projectId: project.id });
	await deleteOldRuns(project.id, 'approach', currentRunId);
	await removeProjectPath(project.dest, 'migration/modernization-decomposition-report.md');
	await resetIndex(project, currentRunId);
}

/** Clears the Analyze phase and everything derived from it, so a re-run starts from nothing. */
export async function resetAnalyze(project: Project, currentRunId?: string): Promise<void> {
	await SubProjectAnalysis.deleteMany({ projectId: project.id });
	await deleteOldRuns(project.id, 'analyze', currentRunId);
	await removeProjectPath(project.dest, 'migration/discovery');
	await resetApproach(project, currentRunId);
}

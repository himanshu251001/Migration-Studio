import type { Project } from '@/features/migration/types';
import { DecompositionStrategyReport } from './models/DecompositionStrategyReport';
import { Run } from './models/Run';
import { SubProjectAnalysis } from './models/SubProjectAnalysis';
import { removeProjectPath } from './projectWorkspace';

/** Deletes the stored runs of `phase`, except the one that is starting now. */
async function deleteOldRuns(projectId: string, phase: string, currentRunId: string): Promise<void> {
	await Run.deleteMany({ projectId, phase, _id: { $ne: currentRunId } });
}

/** Clears the Approach phase: its report (which holds the locked decision), old runs and the report file. */
export async function resetApproach(project: Project, currentRunId: string): Promise<void> {
	await DecompositionStrategyReport.deleteOne({ projectId: project.id });
	await deleteOldRuns(project.id, 'approach', currentRunId);
	await removeProjectPath(project.dest, 'migration/modernization-decomposition-report.md');
}

/** Clears the Analyze phase and everything derived from it, so a re-run starts from nothing. */
export async function resetAnalyze(project: Project, currentRunId: string): Promise<void> {
	await SubProjectAnalysis.deleteMany({ projectId: project.id });
	await deleteOldRuns(project.id, 'analyze', currentRunId);
	await removeProjectPath(project.dest, 'migration/discovery');
	await resetApproach(project, currentRunId);
}

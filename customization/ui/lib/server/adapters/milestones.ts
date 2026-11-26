import type { AnalyzeTask } from '@/features/migration/analyze';
import type { Milestone as UiMilestone, MilestonesDecision, MilestonesResult } from '@/features/migration/milestones';
import type { MilestoneDoc } from '../models/Milestone';
import type { LastRunInfo } from './runInfo';

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Sequencing units into milestones', description: 'Respecting the dependency order and waves' },
	{ label: 'Estimating effort per milestone', description: 'From unit scope, blockers and gaps' },
	{ label: 'Checking coverage', description: 'Every unit and service in exactly one milestone' },
	{ label: 'Writing the milestone plan', description: 'Plan file for the destination repo' }
];

/** Before any run: the task list with no milestones, so the running screen has something to progress against. */
export function emptyMilestones(): MilestonesResult {
	return { tasks: TASKS.map(task => ({ ...task, doneMeta: '' })), logs: [], milestones: [], analysisLogs: [], duration: '' };
}

/** T-shirt size from the number of units and services a milestone delivers. */
function sizeOf(unitCount: number): string {
	return unitCount <= 2 ? 'S' : unitCount <= 4 ? 'M' : 'L';
}

/**
 * Maps the stored plan to what the Milestones step shows. Derivations: `size` comes from how many units and services
 * the milestone delivers (Claude's effort is free text); `covers` lists them; the drafted name is shown, the
 * reviewer's rename travels in the decision. `analysisLogs` is empty because the real deep analysis reports its own
 * progress; `analyzed` carries the stored analyses.
 */
export function adaptMilestones(docs: readonly MilestoneDoc[], run: LastRunInfo): MilestonesResult {
	if (docs.length === 0) {
		return emptyMilestones();
	}
	const ordered = [...docs].sort((a, b) => a.milestoneId.localeCompare(b.milestoneId));
	const milestones: UiMilestone[] = ordered.map(m => ({ id: m.milestoneId, name: m.name, size: sizeOf(m.unitRefs.length), covers: `${m.unitRefs.join(', ')}.` }));
	const units = ordered.reduce((sum, m) => sum + m.unitRefs.length, 0);
	const waves = new Set(ordered.map(m => m.wave)).size;
	const meta = [`${ordered.length} milestones`, `${waves} wave${waves === 1 ? '' : 's'}`, `${units} units and services covered`, '1 file'];
	const analyzed = Object.fromEntries(ordered.filter(m => m.deepAnalysisGeneratedAt).map(m => [m.milestoneId, new Date(m.deepAnalysisGeneratedAt as Date).toISOString()]));
	return { tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index] })), logs: run.logs, milestones, analysisLogs: [], analyzed, duration: run.duration };
}

/** The reviewer's renames and sign-off, or `null` when there is no plan. */
export function adaptMilestonesDecision(docs: readonly MilestoneDoc[]): MilestonesDecision | null {
	if (docs.length === 0) {
		return null;
	}
	return { names: Object.fromEntries(docs.filter(m => m.renamedTo).map(m => [m.milestoneId, m.renamedTo as string])), locked: docs.every(m => m.locked) };
}

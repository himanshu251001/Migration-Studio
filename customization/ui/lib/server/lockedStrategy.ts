import { strategyOptionId } from './adapters/approach';
import type { StrategyReport } from './decompositionStrategy';
import { connectDB } from './db';
import { DecompositionStrategyReport } from './models/DecompositionStrategyReport';
import { StepPrerequisiteError } from './stepErrors';

/** The strategy the reviewer locked in the Approach step, with the evaluation it was chosen from. */
export interface LockedStrategy {
	/** The strategy's name, or the reviewer's own words for a custom strategy. */
	name: string;
	report: StrategyReport;
}

/** The locked strategy of the project; throws a prerequisite error (fixed text) when Approach has not been locked. */
export async function requireLockedStrategy(projectId: string): Promise<LockedStrategy> {
	await connectDB();
	const stored = await DecompositionStrategyReport.findOne({ projectId }).lean();
	if (!stored?.lockedOptionId) {
		throw new StepPrerequisiteError('Lock a decomposition strategy in the Approach step first.');
	}
	if (stored.lockedOptionId === 'other') {
		return { name: stored.lockedCustom?.trim() || 'Custom strategy', report: stored.report };
	}
	const entry = stored.report.strategyComparison.find(candidate => strategyOptionId(candidate.strategy) === stored.lockedOptionId);
	return { name: entry?.strategy ?? stored.report.executiveSummary.recommendedStrategy, report: stored.report };
}

import type { AnalyzeTask } from '@/features/migration/analyze';
import type { ApproachBoundary, ApproachOption, ApproachResult, ApproachRisk, Suitability } from '@/features/migration/approach';
import type { StrategyReport } from '../decompositionStrategy';
import type { LastRunInfo } from './runInfo';

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Reviewing sub-project analyses', description: 'Loading the discovery of every sub-project' },
	{ label: 'Evaluating candidate strategies', description: 'Comparing all decomposition strategies against the evidence' },
	{ label: 'Scoring strategies against risk and coupling', description: 'Weighing suitability, coupling and shared data' },
	{ label: 'Recording the recommendation', description: 'Rationale and trade-offs for reviewers' }
];

/** Stable id of a strategy, used as the option id the reviewer locks. */
export function strategyOptionId(strategy: string): string {
	return strategy.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const SUITABILITY_SCORE: Record<Suitability, number> = { High: 80, Medium: 55, Low: 30 };

function boundaryRisk(complexity: string): Suitability {
	return complexity === 'Low' ? 'Low' : complexity === 'Medium' ? 'Medium' : 'High';
}

/** Before any run: the task list with no options, so the running screen has something to progress against. */
export function emptyApproach(): ApproachResult {
	return { tasks: TASKS.map(task => ({ ...task, doneMeta: '' })), logs: [], options: [], pattern: '', rationale: '', boundaries: [], risks: [], duration: '' };
}

/** Maps the stored strategy report to what the Approach step shows. */
export function adaptApproach(report: StrategyReport | undefined, run: LastRunInfo): ApproachResult {
	if (!report) {
		return emptyApproach();
	}
	const options: ApproachOption[] = report.strategyComparison.map(entry => ({
		id: strategyOptionId(entry.strategy),
		name: entry.strategy,
		suitability: entry.suitability,
		score: Math.min(100, SUITABILITY_SCORE[entry.suitability] + (entry.selectionOutcome === 'Selected' ? 15 : entry.selectionOutcome === 'Partially Applied' ? 5 : 0)),
		recommended: entry.selectionOutcome === 'Selected',
		when: entry.whenItWorksWell
	}));
	const boundaries: ApproachBoundary[] = [...report.modernizationBoundaries]
		.sort((a, b) => a.recommendedOrder - b.recommendedOrder)
		.map(b => ({ name: b.name, risk: boundaryRisk(b.migrationComplexity), description: b.description }));
	const risks: ApproachRisk[] = report.risks.map(r => ({ level: r.severity === 'Critical' ? 'High' : r.severity, text: r.risk, mitigation: r.mitigation }));
	const meta = [`${report.modernizationBoundaries.length} boundaries`, `${options.length} strategies`, 'Scored', 'Recommendation ready'];
	return {
		tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index] })),
		logs: run.logs,
		options,
		pattern: report.executiveSummary.recommendedStrategy,
		rationale: report.executiveSummary.rationale,
		boundaries,
		risks,
		duration: run.duration
	};
}

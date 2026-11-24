import { runClaudeSynthesis } from './claudeCli';
import type { Dimensions } from './discovery';

/** The candidate strategies, in the order the report lists them. */
export const DECOMPOSITION_STRATEGIES = [
	'Persona-Based',
	'Module-Based',
	'Capability-Based',
	'Domain-Based (DDD)',
	'Business Process / Value Stream-Based',
	'Data Ownership-Based',
	'Event-Based',
	'API Consumer-Based',
	'Risk-Based',
	'Team-Based',
	'Deployment-Based',
	'Technology-Based'
] as const;

type Complexity = 'Low' | 'Medium' | 'High' | 'Very High';

export interface StrategyReport {
	strategyComparison: { strategy: string; strengths: string[]; weaknesses: string[]; suitability: 'High' | 'Medium' | 'Low'; whenItWorksWell: string; selectionOutcome: 'Selected' | 'Rejected' | 'Partially Applied'; selectionReason: string }[];
	executiveSummary: { recommendedStrategy: string; confidenceLevel: Complexity; rationale: string };
	hybridRecommendation: { isHybrid: boolean; components: { area: string; strategy: string; justification: string }[] };
	evidence: { recurringPatterns: string[]; businessBoundaries: string[]; sharedInfrastructure: string[]; sharedDatabases: string[]; tightlyCoupled: string[]; independent: string[] };
	modernizationBoundaries: { name: string; description: string; projects: string[]; justification: string; migrationComplexity: Complexity; recommendedOrder: number }[];
	risks: { risk: string; category: 'Architectural' | 'Organizational' | 'Technical' | 'Data' | 'Process'; severity: 'Low' | 'Medium' | 'High' | 'Critical'; mitigation: string }[];
}

const STRINGS = { type: 'array', items: { type: 'string' } };
const COMPLEXITY = { type: 'string', enum: ['Low', 'Medium', 'High', 'Very High'] };

function strictObject(properties: Record<string, object>): object {
	return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

function list(items: object): object {
	return { type: 'array', items };
}

const STRATEGY_REPORT_SCHEMA = strictObject({
	strategyComparison: list(strictObject({
		strategy: { type: 'string', enum: [...DECOMPOSITION_STRATEGIES] },
		strengths: STRINGS,
		weaknesses: STRINGS,
		suitability: { type: 'string', enum: ['High', 'Medium', 'Low'] },
		whenItWorksWell: { type: 'string' },
		selectionOutcome: { type: 'string', enum: ['Selected', 'Rejected', 'Partially Applied'] },
		selectionReason: { type: 'string' }
	})),
	executiveSummary: strictObject({ recommendedStrategy: { type: 'string' }, confidenceLevel: COMPLEXITY, rationale: { type: 'string' } }),
	hybridRecommendation: strictObject({
		isHybrid: { type: 'boolean' },
		components: list(strictObject({ area: { type: 'string' }, strategy: { type: 'string' }, justification: { type: 'string' } }))
	}),
	evidence: strictObject({ recurringPatterns: STRINGS, businessBoundaries: STRINGS, sharedInfrastructure: STRINGS, sharedDatabases: STRINGS, tightlyCoupled: STRINGS, independent: STRINGS }),
	modernizationBoundaries: list(strictObject({
		name: { type: 'string' },
		description: { type: 'string' },
		projects: STRINGS,
		justification: { type: 'string' },
		migrationComplexity: COMPLEXITY,
		recommendedOrder: { type: 'integer' }
	})),
	risks: list(strictObject({
		risk: { type: 'string' },
		category: { type: 'string', enum: ['Architectural', 'Organizational', 'Technical', 'Data', 'Process'] },
		severity: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
		mitigation: { type: 'string' }
	}))
});

/** One analyzed sub-project, as the strategy prompt sees it. */
export interface AnalyzedSubProject {
	subProjectPath: string;
	dimensions: Dimensions;
}

function buildPrompt(subProjects: readonly AnalyzedSubProject[]): string {
	const evidence = subProjects.map(s => ({ subProjectPath: s.subProjectPath, ...s.dimensions }));
	return `You are a senior enterprise architect specializing in application modernization strategy. Ground every recommendation in the evidence from the project analyses. Think critically. Do not recommend a strategy that the evidence does not support. Never invent facts: every claim must be traceable to something in the provided data.

## Sub-project analyses (${subProjects.length} project(s), the ONLY source of truth)
${JSON.stringify(evidence, undefined, 2)}

---

## Reasoning checklist

Work through each question before making any recommendation:

1. Business organization: how are responsibilities, capabilities, workflows and processes distributed? Do they cluster around business domains?
2. Technical organization: what are the natural module and layer boundaries (architecture.modules, architecture.boundaries)?
3. User organization: how do personas, roles and journeys map to application areas?
4. Domain boundaries: are there clear bounded contexts with distinct aggregates and ownership (business.domains)?
5. Capability boundaries: are there self-contained capabilities (business.capabilities) that could be deployed and scaled independently?
6. Process boundaries: do end-to-end workflows (business.workflows, business.processes) span sub-projects?
7. Data ownership: who owns what data (data.ownership)? Do shared databases or tables block clean cuts?
8. Team ownership: can parts be maintained by independent teams without constant coordination?
9. Coupling and cohesion: what is tightly coupled (dependencies.crossProjectCoupling, modernization.coupling) and expensive to split?
10. Scalability and deployment: which parts need independent scaling (modernization.independentDeployability)?
11. Future service boundaries: where would cuts make the most sense (architecture.interfaces, architecture.integrations, modernization.candidateBoundaries)?
12. Ease of migration: what can move first without blocking the rest (modernization.decompositionPoints, migrationComplexity)?
13. Long-term maintainability: which decomposition is easiest to evolve (modernization.reusability, architecture.sharedLibraries)?

---

## The ${DECOMPOSITION_STRATEGIES.length} strategies to evaluate (every one must appear in strategyComparison, in this exact order)

${DECOMPOSITION_STRATEGIES.map((name, index) => `${index + 1}. ${name}`).join('\n')}

For each strategy:
- strengths and weaknesses specific to what you observe in THIS data, not generic descriptions
- suitability (High, Medium or Low) reasoned from the actual domain, coupling, architecture and technology evidence
- selectionOutcome: exactly one strategy must be "Selected", whichever best fits this evidence
- selectionReason citing specific evidence (sub-project paths, real field values)

## Required output

- executiveSummary: recommendedStrategy (the Selected strategy's exact name), confidenceLevel, rationale citing real numbers (sub-project count, domain count, coupling observations).
- hybridRecommendation: if a hybrid fits better, set isHybrid true and say which strategy governs which concern, each justified by evidence. Otherwise isHybrid false and components [].
- evidence: every array derived from the actual data (recurring patterns, union of business domains, shared infrastructure, shared databases and tables, tightly coupled items, independent sub-projects).
- modernizationBoundaries: one entry per sub-project or sensible grouping, ordered by recommendedOrder (lowest risk first).
- risks: derived from technicalDebt, shared database coupling and cross-project coupling; never a risk that is not traceable to the JSON above. Include category and severity.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
}

/** Evaluates every strategy against the sub-project analyses; reasoning only, no file access. */
export async function evaluateStrategies(subProjects: readonly AnalyzedSubProject[], signal: AbortSignal, onProcessStart: (kill: () => void) => void): Promise<StrategyReport> {
	const report = await runClaudeSynthesis<StrategyReport>({ prompt: buildPrompt(subProjects), jsonSchema: STRATEGY_REPORT_SCHEMA, signal, onProcessStart });
	return normalizeReport(report);
}

/** Guarantees exactly one `Selected` strategy that matches the recommendation, whatever the model returned. */
function normalizeReport(report: StrategyReport): StrategyReport {
	const comparison = report.strategyComparison ?? [];
	const recommended = report.executiveSummary?.recommendedStrategy;
	const selected = comparison.find(entry => entry.strategy === recommended) ?? comparison.find(entry => entry.selectionOutcome === 'Selected') ?? comparison[0];
	return {
		...report,
		strategyComparison: comparison.map(entry => entry === selected ? { ...entry, selectionOutcome: 'Selected' } : entry.selectionOutcome === 'Selected' ? { ...entry, selectionOutcome: 'Partially Applied' } : entry),
		executiveSummary: { ...report.executiveSummary, recommendedStrategy: selected?.strategy ?? recommended ?? '' },
		hybridRecommendation: report.hybridRecommendation ?? { isHybrid: false, components: [] },
		modernizationBoundaries: report.modernizationBoundaries ?? [],
		risks: report.risks ?? []
	};
}

/** The report as a Markdown file for the destination repo. */
export function buildReportMarkdown(report: StrategyReport, projectCount: number): string {
	const lines: string[] = ['# Modernization Decomposition Strategy Report', '', `> Analyzed **${projectCount}** sub-project(s) in this repository.`, '', '## Executive Summary', ''];
	lines.push(`**Recommended Strategy:** ${report.executiveSummary.recommendedStrategy}`, '', `**Confidence Level:** ${report.executiveSummary.confidenceLevel}`, '', report.executiveSummary.rationale, '', '## Strategy Comparison', '');
	for (const s of report.strategyComparison) {
		lines.push(`### ${s.strategy}: ${s.selectionOutcome}`, '', `**Suitability:** ${s.suitability}`, '', `**When it works well:** ${s.whenItWorksWell}`, '', '**Strengths:**', ...s.strengths.map(x => `- ${x}`), '', '**Weaknesses:**', ...s.weaknesses.map(x => `- ${x}`), '', `**Selection reason:** ${s.selectionReason}`, '');
	}
	if (report.hybridRecommendation.isHybrid) {
		lines.push('## Hybrid Recommendation', '');
		for (const c of report.hybridRecommendation.components) {
			lines.push(`### ${c.area}`, `**Strategy:** ${c.strategy}`, '', c.justification, '');
		}
	}
	const e = report.evidence;
	lines.push('## Evidence', '', `**Business Boundaries:** ${e.businessBoundaries.join(', ') || 'None'}`, '', `**Shared Databases:** ${e.sharedDatabases.join(', ') || 'None'}`, '', `**Tightly Coupled:** ${e.tightlyCoupled.join(', ') || 'None'}`, '', `**Independent:** ${e.independent.join(', ') || 'None'}`, '', '## Suggested Modernization Boundaries', '');
	for (const b of [...report.modernizationBoundaries].sort((x, y) => x.recommendedOrder - y.recommendedOrder)) {
		lines.push(`### ${b.recommendedOrder}. ${b.name}`, '', b.description, '', `**Scope:** ${b.projects.join(', ')}`, '', `**Migration Complexity:** ${b.migrationComplexity}`, '', `**Justification:** ${b.justification}`, '');
	}
	lines.push('## Risks', '');
	for (const r of report.risks) {
		lines.push(`### [${r.severity}] ${r.risk}`, `**Category:** ${r.category}`, '', `**Mitigation:** ${r.mitigation}`, '');
	}
	return lines.join('\n');
}

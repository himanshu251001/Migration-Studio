import type { AnalyzeTask } from '@/features/migration/analyze';
import type { ScopeDecision, ScopeGap, ScopeResult, ScopeSection } from '@/features/migration/scope';
import type { ScopeCharterDoc } from '../models/ScopeCharter';
import { DATABASE_OPTIONS, ROLLOUT_STRATEGIES } from '../targetCatalog';
import type { LastRunInfo } from './runInfo';

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Drafting scope from units and dependencies', description: 'In-scope and out-of-scope items' },
	{ label: 'Proposing goals', description: 'Modernization, deployability, risk' },
	{ label: 'Proposing target stacks', description: 'Candidates with architecture trade-offs' },
	{ label: 'Writing the charter', description: 'Charter file for the destination repo' }
];

const RISK_RANK = { Low: 0, Medium: 1, High: 2 } as const;

/** Before any run: the task list and the fixed choices, so the running screen has something to progress against. */
export function emptyScope(): ScopeResult {
	return { tasks: TASKS.map(task => ({ ...task, doneMeta: '' })), logs: [], goals: [], stacks: [], databases: [...DATABASE_OPTIONS], strategies: [...ROLLOUT_STRATEGIES], gaps: [], gapsReady: false, sections: [], duration: '' };
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function sectionsOf(doc: ScopeCharterDoc): ScopeSection[] {
	const { charter } = doc;
	const governance = charter.governanceModel;
	return [
		{ id: 'in-scope', title: 'In Scope', summary: count(charter.scopeInScope.length, 'item'), items: charter.scopeInScope.map(i => ({ title: i.item, description: i.justification })) },
		{ id: 'out-of-scope', title: 'Out of Scope', summary: count(charter.scopeOutOfScope.length, 'item'), items: charter.scopeOutOfScope.map(i => ({ title: i.item, description: i.justification })) },
		{ id: 'success', title: 'Success Criteria', summary: count(charter.successCriteriaByWave.length, 'wave'), items: charter.successCriteriaByWave.map(w => ({ title: `Wave ${w.wave}: ${w.label}`, description: w.exitConditions.join(' ') })) },
		{ id: 'constraints', title: 'Constraints', summary: count(charter.constraints.length, 'constraint'), items: charter.constraints.map(c => ({ title: c.category, description: `${c.constraint} (${c.justification})` })) },
		{ id: 'risks', title: 'Acknowledged Risks', summary: count(charter.risksAcknowledged.length, 'risk'), items: charter.risksAcknowledged.map(r => ({ title: `${r.risk} (${r.severity})`, description: r.mitigationCommitment })) },
		{
			id: 'governance', title: 'Governance', summary: count(governance.decisionAuthority.length + 3, 'decision'),
			items: [
				{ title: 'ADR process', description: governance.adrProcess },
				{ title: 'Wave gate process', description: governance.waveGateProcess },
				{ title: 'Security remediation', description: governance.securityRemediationTracking },
				...governance.decisionAuthority.map(d => ({ title: d.decision, description: `Owner: ${d.owner}` }))
			]
		}
	];
}

/** The gaps as the Scope step shows them: the riskier of the two parity risks is the headline risk. */
function gapsOf(doc: ScopeCharterDoc): ScopeGap[] {
	return doc.gaps.map(gap => ({
		id: gap.gapId,
		area: gap.category,
		title: gap.title,
		risk: RISK_RANK[gap.uiParityRisk] >= RISK_RANK[gap.functionalParityRisk] ? gap.uiParityRisk : gap.functionalParityRisk,
		effort: gap.effort,
		uiParity: gap.uiParityRisk,
		functionalParity: gap.functionalParityRisk,
		exists: gap.existingImplementation,
		needed: gap.requiredImplementation,
		options: gap.recommendedOptions.map(option => ({ title: option.option, description: option.tradeoffs ? `${option.description} Trade-off: ${option.tradeoffs}` : option.description, recommended: option.recommended }))
	}));
}

/**
 * Maps the stored charter to what the Scope step shows. Derivations: a goal's description is its statement and its
 * success is the success indicator (the business driver is in the charter file); a gap's risk is the higher of its
 * UI and functional parity risks; a resolution option's description carries its trade-off; `gapsReady` is true once the
 * gap analysis ran for the stored selection (a changed selection discards the gaps, so it cannot be stale here).
 */
export function adaptScope(doc: ScopeCharterDoc | null, run: LastRunInfo): ScopeResult {
	if (!doc) {
		return emptyScope();
	}
	const sections = sectionsOf(doc);
	const meta = [
		`${doc.charter.scopeInScope.length} in scope`,
		count(doc.charter.goals.length, 'goal'),
		count(doc.candidates.length, 'candidate'),
		'1 file'
	];
	return {
		tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index] })),
		logs: run.logs,
		goals: doc.charter.goals.map(g => ({ title: g.name, description: g.statement, success: g.successIndicator })),
		stacks: doc.candidates.map(c => ({ id: c.id, name: c.name, architecture: c.architecture, description: c.description, tradeoff: c.tradeoff })),
		databases: [...DATABASE_OPTIONS],
		strategies: [...ROLLOUT_STRATEGIES],
		gaps: gapsOf(doc),
		gapsReady: doc.gapSelection !== null,
		sections,
		duration: run.duration
	};
}

/** The reviewer's choices, or `null` before the first draft. */
export function scopeDecisionOf(doc: ScopeCharterDoc | null): ScopeDecision | null {
	if (!doc) {
		return null;
	}
	return {
		...(doc.stack ? { stack: doc.stack } : {}),
		...(doc.customStack ? { customStack: doc.customStack } : {}),
		database: doc.database,
		strategy: doc.strategy,
		resolutions: doc.resolutions,
		locked: doc.locked
	};
}

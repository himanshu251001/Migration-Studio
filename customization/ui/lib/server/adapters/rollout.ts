import type { AnalyzeTask } from '@/features/migration/analyze';
import type { RolloutCard, RolloutResult } from '@/features/migration/rollout';
import type { MigrationStrategyDoc } from '../models/MigrationStrategy';
import type { LastRunInfo } from './runInfo';

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Reading the locked decisions', description: 'Target stack, database approach and rollout strategy' },
	{ label: 'Designing the end-state topology', description: 'Routing, data access, auth and background work' },
	{ label: 'Sequencing the waves', description: 'API strategy per wave and coexistence rules' },
	{ label: 'Writing the migration strategy', description: 'Strategy file for the destination repo' }
];

/** Before any run: the task list with no cards, so the running screen has something to progress against. */
export function emptyRollout(): RolloutResult {
	return { tasks: TASKS.map(task => ({ ...task, doneMeta: '' })), logs: [], modules: 0, waves: 0, decisions: 0, attention: [], cards: [], duration: '' };
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Splits prose into one bullet per paragraph. */
function paragraphs(text: string): string[] {
	return text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
}

/**
 * Maps the stored strategy to what the Rollout step shows. Derivations: the tiles are the strategy's sections, each
 * list item becomes a bullet; `modules` is the unit count saved with the strategy, `waves` the waves with an API
 * strategy, `decisions` the architectural decisions, `attention` the open items.
 */
export function adaptRollout(doc: MigrationStrategyDoc | null, run: LastRunInfo): RolloutResult {
	if (!doc) {
		return emptyRollout();
	}
	const s = doc.strategy;
	const cards: RolloutCard[] = [
		{ id: 'topology', title: 'Production Topology', sub: 'End state', bullets: paragraphs(s.productionTopology) },
		{ id: 'structure', title: 'Application Structure', sub: count(s.applicationStructure.length, 'module'), bullets: s.applicationStructure.map(r => `${r.sourceModule} → ${r.targetLocation} (${r.handlingStrategy}; guard: ${r.roleGuard})`) },
		{ id: 'api-waves', title: 'API Strategy by Wave', sub: count(s.apiStrategyByWave.length, 'wave'), bullets: s.apiStrategyByWave.map(w => `Wave ${w.wave}: ${w.description}`) },
		{ id: 'auth', title: 'Authentication', sub: 'Provider, session, roles', bullets: [`Provider: ${s.authStrategy.provider}`, `Session: ${s.authStrategy.session}`, `Roles: ${s.authStrategy.roleResolution}`, `Guard: ${s.authStrategy.middlewareOrEquivalent}`] },
		{ id: 'integration', title: 'Integration Patterns', sub: '3 patterns', bullets: [`Data access: ${s.integrationPatterns.dataAccessPattern}`, `Background jobs: ${s.integrationPatterns.backgroundJobPattern}`, `Anti-corruption layer: ${s.integrationPatterns.antiCorruptionLayer}`] },
		{ id: 'data', title: 'Data Migration', sub: count(s.dataMigrationPrinciples.length, 'principle'), bullets: s.dataMigrationPrinciples },
		{ id: 'rollback', title: 'Rollback and Coexistence', sub: count(s.rollbackAndCoexistence.rollbackTriggers.length, 'trigger'), bullets: [...s.rollbackAndCoexistence.coexistenceRules.map(r => `Rule: ${r}`), ...s.rollbackAndCoexistence.rollbackTriggers.map(t => `Rollback when: ${t}`)] },
		{ id: 'decisions', title: 'Architectural Decisions', sub: count(s.architecturalDecisions.length, 'decision'), bullets: s.architecturalDecisions.map(d => `${d.decision}: ${d.rationale} Trade-off: ${d.tradeoff}`) }
	];
	const meta = [doc.targetStackName, 'End-state topology', count(s.apiStrategyByWave.length, 'wave'), '1 file'];
	return {
		tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index] })),
		logs: run.logs,
		modules: doc.unitCount,
		waves: s.apiStrategyByWave.length,
		decisions: s.architecturalDecisions.length,
		attention: s.openItems,
		cards,
		duration: run.duration
	};
}

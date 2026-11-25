import { runClaudeSynthesis } from './claudeCli';
import type { TargetStackEntry } from './targetCatalog';

/** The rollout strategy: the "how" of the migration. Stored as received. */
export interface MigrationStrategyData {
	executiveSummary: string;
	productionTopology: string;
	applicationStructure: { sourceModule: string; targetLocation: string; handlingStrategy: string; roleGuard: string }[];
	apiStrategyByWave: { wave: number; description: string }[];
	authStrategy: { provider: string; session: string; roleResolution: string; middlewareOrEquivalent: string };
	integrationPatterns: { dataAccessPattern: string; backgroundJobPattern: string; antiCorruptionLayer: string };
	dataMigrationPrinciples: string[];
	rollbackAndCoexistence: { coexistenceRules: string[]; rollbackTriggers: string[] };
	architecturalDecisions: { decision: string; rationale: string; tradeoff: string }[];
	openItems: string[];
}

export interface StrategyInput {
	targetStack: TargetStackEntry;
	architectureOption: string;
	/** The reviewer's database choice, in words. */
	database: string;
	keepsDatabase: boolean;
	rolloutStrategy: string;
	units: { name: string; wave: number | 'blocked' | null }[];
	sharedServices: { name: string; wave: number | 'blocked' | null }[];
	capabilities: { name: string; domain: string }[];
	subProjects: { subProjectPath: string; framework: string }[];
}

/** The wave numbers present in the input, ascending. */
export function wavesOf(input: Pick<StrategyInput, 'units' | 'sharedServices'>): number[] {
	return [...new Set([...input.units, ...input.sharedServices].map(t => t.wave).filter((w): w is number => typeof w === 'number'))].sort((a, b) => a - b);
}

/** The deterministic strategy from the locked decisions alone. Used when Claude's draft fails, and the run log says so. */
export function buildMigrationStrategy(input: StrategyInput): MigrationStrategyData {
	const { targetStack: stack, architectureOption, database, keepsDatabase, rolloutStrategy } = input;
	const waves = wavesOf(input);
	return {
		executiveSummary: `This migration targets ${stack.name} (${stack.language}, ${stack.architecturePattern}) using a "${architectureOption}" architecture. Rollout follows a "${rolloutStrategy}" strategy across ${waves.length} wave(s), covering ${input.units.length} migration unit(s) and ${input.sharedServices.length} shared service(s). Database approach: ${database}.`,
		productionTopology: `At end state, the system runs on ${stack.name}. Routing is handled via ${stack.routing}. Data access goes through ${stack.dataAccess}. Authentication uses ${stack.auth}. Background and async work runs via ${stack.backgroundJobs}. ${keepsDatabase ? 'The existing database is retained; only the data-access layer changes.' : 'Data is migrated to a new database as part of this plan.'}`,
		applicationStructure: input.capabilities.slice(0, 12).map(c => ({ sourceModule: `${c.domain}: ${c.name}`, targetLocation: `${stack.name} module for "${c.name}"`, handlingStrategy: stack.architecturePattern, roleGuard: 'To be defined during task planning' })),
		apiStrategyByWave: waves.map(wave => ({ wave, description: `Wave ${wave}: capabilities in this wave are exposed via ${stack.routing}, backed by ${stack.dataAccess}.` })),
		authStrategy: {
			provider: `Authentication provider matching the target stack: ${stack.auth}.`,
			session: 'Session and token strategy to be finalized during task planning.',
			roleResolution: 'Role claims are resolved from the existing identity provider and mapped one to one to the legacy role names.',
			middlewareOrEquivalent: `Request guarding is implemented through ${stack.routing}'s middleware or filter-chain equivalent.`
		},
		integrationPatterns: {
			dataAccessPattern: `All data access goes through ${stack.dataAccess}, never a direct legacy-API proxy.`,
			backgroundJobPattern: `Async and scheduled work migrates to ${stack.backgroundJobs}.`,
			antiCorruptionLayer: 'A thin translation layer normalizes legacy response-shape differences (casing, envelopes) at the boundary.'
		},
		dataMigrationPrinciples: keepsDatabase
			? ['The existing database schema is retained.', 'Only the data-access layer is swapped; no live data migration is performed.']
			: ['Data moves to a new database only after a validated migration script and rollback plan exist.', 'No unit is approved until its data migration is verified against a fixture.'],
		rollbackAndCoexistence: {
			coexistenceRules: ['The legacy application remains the source of truth until a unit\'s replacement is approved.', 'No unit merges automatically.'],
			rollbackTriggers: ['A failed parity check on approval.', 'A production incident traced to a migrated unit.']
		},
		architecturalDecisions: [
			{ decision: `${stack.name} as the target stack`, rationale: 'Chosen and locked in the Scope step for this migration.', tradeoff: 'Alternatives were not pursued once this stack was locked.' },
			{ decision: keepsDatabase ? 'Keep the existing database' : `Database: ${database}`, rationale: keepsDatabase ? 'Avoids the risk and cost of a live data migration.' : 'A database change was judged necessary for this migration.', tradeoff: keepsDatabase ? 'Future schema evolution must still satisfy the legacy schema during coexistence.' : 'Requires a validated migration and rollback plan per unit.' }
		],
		openItems: ['Confirm the role-guard mapping per capability during task planning.', 'Confirm background-job configuration parity (retry and backoff) with the legacy system.']
	};
}

const STRINGS = { type: 'array', items: { type: 'string' } };
const TEXT = { type: 'string' };

function strictObject(properties: Record<string, object>): object {
	return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

const STRATEGY_SCHEMA = strictObject({
	executiveSummary: TEXT,
	productionTopology: TEXT,
	applicationStructure: { type: 'array', items: strictObject({ sourceModule: TEXT, targetLocation: TEXT, handlingStrategy: TEXT, roleGuard: TEXT }) },
	apiStrategyByWave: { type: 'array', items: strictObject({ wave: { type: 'integer' }, description: TEXT }) },
	authStrategy: strictObject({ provider: TEXT, session: TEXT, roleResolution: TEXT, middlewareOrEquivalent: TEXT }),
	integrationPatterns: strictObject({ dataAccessPattern: TEXT, backgroundJobPattern: TEXT, antiCorruptionLayer: TEXT }),
	dataMigrationPrinciples: STRINGS,
	rollbackAndCoexistence: strictObject({ coexistenceRules: STRINGS, rollbackTriggers: STRINGS }),
	architecturalDecisions: { type: 'array', items: strictObject({ decision: TEXT, rationale: TEXT, tradeoff: TEXT }) },
	openItems: STRINGS
});

/** Asks Claude to write the strategy from the locked decisions. Reasoning only, no file access. */
export async function buildMigrationStrategyWithClaude(input: StrategyInput, signal: AbortSignal, onProcessStart: (kill: () => void) => void): Promise<MigrationStrategyData> {
	const prompt = `You are writing the Migration Strategy, the "how" execution document for this migration, grounded ONLY in the data below. Never invent a fact that is not traceable to this data. Use the locked target stack's real vocabulary (its name, routing mechanism, data-access approach, auth mechanism, background-job mechanism) throughout, and never mention another framework unless it is listed below.

## Locked target stack
${JSON.stringify(input.targetStack, undefined, 2)}

## Locked architecture option, database decision, rollout strategy
${JSON.stringify({ architectureOption: input.architectureOption, database: input.database, keepsExistingDatabase: input.keepsDatabase, rolloutStrategy: input.rolloutStrategy }, undefined, 2)}

## Migration units and shared services (with wave assignments)
${JSON.stringify({ units: input.units, sharedServices: input.sharedServices }, undefined, 2)}

## Capabilities (name and domain)
${JSON.stringify(input.capabilities, undefined, 2)}

## Discovered sub-projects (source side)
${JSON.stringify(input.subProjects, undefined, 2)}

## Instructions

**executiveSummary:** 3 to 5 sentences: the migration pattern ("${input.architectureOption}") and what it means for end users and the source application, the target stack by name, the exact unit and wave counts from the data, and the primary business driver if it can be inferred. No filler.

**productionTopology:** 2 to 4 paragraphs using only the target stack's real component names: traffic entry and routing, the API and data-access layer, authentication, background work, and the fate of each source sub-project at end state (retired, replaced or retained). State what is GONE at end state.

**applicationStructure:** One row per source module (group by domain when there are more than 10 capabilities). sourceModule is "domain: capability name" from the data. targetLocation is a real location in the target stack's naming convention. handlingStrategy matches the capability's read or write nature in the stack's vocabulary. roleGuard names the stack's actual guard mechanism. Never write "to be defined".

**apiStrategyByWave:** One entry per wave present in the input. Each states which source endpoints stay active, which new target routes appear, and the routing rule change for that wave. Never "TBD".

**authStrategy:** All four fields in the target stack's actual auth mechanism: provider (library or protocol and how it connects to the existing identity provider), session (token type, storage, transmission), roleResolution (source claim and target mapping), middlewareOrEquivalent (the actual guard by name). Never "to be finalized".

**integrationPatterns:** dataAccessPattern (proxy the source API, call the source database, or own the schema; name the ORM or client and how response-format differences are normalized), backgroundJobPattern (which jobs migrate now and which stay on the source, and when new job infrastructure arrives), antiCorruptionLayer (field-casing normalization with direction, and pagination envelope preservation). Be concrete.

**dataMigrationPrinciples:** Complete, actionable statements. ${input.keepsDatabase ? 'The database is kept: the schema is not altered, only the data-access layer is replaced, and source and target data clients must return identical results on shared fixtures before cutover.' : 'The database moves: no data movement until a validated script and rollback plan exist, a rollback migration for every schema ownership transfer, and no unit approval until its data migration is verified against a fixture.'} Do not mix the two.

**rollbackAndCoexistence:** coexistenceRules are invariants: the source stays authoritative until a unit's replacement passes acceptance and is approved, the traffic routing mechanism is the single cutover control point (no dual-write), and source API changes stay backwards-compatible. Add rules implied by the rollout strategy and waves. rollbackTriggers each name a measurable signal, a threshold and a rollback action.

**architecturalDecisions:** Four or more, in order: target stack, migration pattern, database decision, auth strategy. Each rationale cites a reason derivable from this data and each tradeoff names the accepted cost.

**openItems:** Genuine open questions only, each referencing a specific unit, capability or setting and stating exactly what is unknown. Never deferred tasks.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
	return runClaudeSynthesis<MigrationStrategyData>({ prompt, jsonSchema: STRATEGY_SCHEMA, signal, onProcessStart });
}

/** The strategy as a Markdown file for the destination repo. */
export function buildMigrationStrategyMarkdown(strategy: MigrationStrategyData, targetStackName: string, architectureOption: string): string {
	const lines: string[] = ['# Migration Strategy', '', `> **Target Stack:** ${targetStackName} | ${architectureOption}`, '', '## Executive Summary', '', strategy.executiveSummary, '', '## Future-State Architecture', '', '### Production Topology', '', strategy.productionTopology, '', '### Application Structure', '', '| Source | Target Location | Handling Strategy | Role Guard |', '|---|---|---|---|'];
	lines.push(...strategy.applicationStructure.map(r => `| ${r.sourceModule} | ${r.targetLocation} | ${r.handlingStrategy} | ${r.roleGuard} |`), '', '### API Strategy by Wave', '');
	for (const w of strategy.apiStrategyByWave) {
		lines.push(`#### Wave ${w.wave}`, '', w.description, '');
	}
	const a = strategy.authStrategy;
	lines.push('### Authentication Strategy', '', `**Provider:** ${a.provider}`, '', `**Session:** ${a.session}`, '', `**Role Resolution:** ${a.roleResolution}`, '', `**Middleware/Equivalent:** ${a.middlewareOrEquivalent}`, '');
	const i = strategy.integrationPatterns;
	lines.push('## Integration Patterns', '', `**Data Access:** ${i.dataAccessPattern}`, '', `**Background Jobs:** ${i.backgroundJobPattern}`, '', `**Anti-Corruption Layer:** ${i.antiCorruptionLayer}`, '', '## Data Migration', '');
	lines.push(...strategy.dataMigrationPrinciples.map(p => `- ${p}`), '', '## Rollback and Coexistence', '', '### Coexistence Rules', '');
	lines.push(...strategy.rollbackAndCoexistence.coexistenceRules.map(r => `- ${r}`), '', '### Rollback Triggers', '');
	lines.push(...strategy.rollbackAndCoexistence.rollbackTriggers.map(r => `- ${r}`), '', '## Architectural Decisions', '');
	for (const d of strategy.architecturalDecisions) {
		lines.push(`### ${d.decision}`, '', `**Rationale:** ${d.rationale}`, '', `**Trade-off:** ${d.tradeoff}`, '');
	}
	lines.push('## Open Items', '', ...strategy.openItems.map(o => `- ${o}`), '');
	return lines.join('\n');
}

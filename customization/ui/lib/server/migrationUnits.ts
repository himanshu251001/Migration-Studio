import { runClaudeSynthesis } from './claudeCli';
import type { CohesionIssue, UnitDeviation } from './models/MigrationUnitCatalog';

/** The capability fields the unit grouping reads. */
export interface UnitCapability {
	seqNum: number;
	domain: string;
	name: string;
	description: string;
	businessOutcome: string;
	personas: string[];
	frequency: string;
	criticality: string;
	primaryProjects: string[];
	dependencies: string[];
}

export interface SharedServiceCandidate {
	seqNum: number;
	name: string;
	dependentCount: number;
	reason: string;
}

export interface GroupedUnit {
	name: string;
	domain: string;
	capabilities: { seqNum: number; name: string }[];
	sharedServicesConsumed: string[];
	dependenciesOnOtherUnits: { unitName: string; reason: string }[];
	scopeEstimate: 'Small' | 'Medium' | 'Large';
	scopeRationale: string;
}

/** A capability that three or more others depend on is a shared platform service rather than part of a unit. */
const SHARED_SERVICE_THRESHOLD = 3;
const CHUNK_SIZE = 6;
const SCOPE_THRESHOLDS = { Small: '1-3 capabilities', Medium: '4-7 capabilities', Large: '8+ capabilities' };

/** Capabilities that enough other capabilities depend on to be extracted once, ahead of their consumers. */
export function identifySharedServices(capabilities: readonly UnitCapability[]): SharedServiceCandidate[] {
	const dependentCount = new Map<string, number>();
	for (const capability of capabilities) {
		for (const dependency of capability.dependencies) {
			dependentCount.set(dependency, (dependentCount.get(dependency) ?? 0) + 1);
		}
	}
	const candidates: SharedServiceCandidate[] = [];
	for (const capability of capabilities) {
		const count = dependentCount.get(capability.name) ?? 0;
		if (count >= SHARED_SERVICE_THRESHOLD) {
			candidates.push({ seqNum: candidates.length + 1, name: capability.name, dependentCount: count, reason: `Referenced by ${count} other capabilities as a dependency.` });
		}
	}
	return candidates;
}

/** Groups the non-shared capabilities into units by domain (at most six per unit) and derives unit-to-unit dependencies. */
export function groupIntoMigrationUnits(capabilities: readonly UnitCapability[], sharedServiceNames: readonly string[]): GroupedUnit[] {
	const eligible = capabilities.filter(capability => !sharedServiceNames.includes(capability.name));
	const byDomain = new Map<string, UnitCapability[]>();
	for (const capability of eligible) {
		byDomain.set(capability.domain, [...(byDomain.get(capability.domain) ?? []), capability]);
	}
	const units: GroupedUnit[] = [];
	for (const [domain, items] of byDomain) {
		const chunks: UnitCapability[][] = [];
		for (let i = 0; i < items.length; i += CHUNK_SIZE) {
			chunks.push(items.slice(i, i + CHUNK_SIZE));
		}
		chunks.forEach((chunk, index) => {
			const size = chunk.length;
			const scopeEstimate = size <= 3 ? 'Small' : size <= 7 ? 'Medium' : 'Large';
			units.push({
				name: chunks.length > 1 ? `${domain} (${index + 1})` : domain,
				domain,
				capabilities: chunk.map(c => ({ seqNum: c.seqNum, name: c.name })),
				sharedServicesConsumed: [...new Set(chunk.flatMap(c => c.dependencies.filter(dependency => sharedServiceNames.includes(dependency))))],
				dependenciesOnOtherUnits: [],
				scopeEstimate,
				scopeRationale: `${size} capabilit${size === 1 ? 'y' : 'ies'} in this unit (${SCOPE_THRESHOLDS[scopeEstimate]}).`
			});
		});
	}
	// A capability that depends on one living in a different unit creates a unit-level edge.
	const unitOfCapability = new Map<string, string>();
	for (const unit of units) {
		for (const capability of unit.capabilities) {
			unitOfCapability.set(capability.name, unit.name);
		}
	}
	const byName = new Map(eligible.map(capability => [capability.name, capability]));
	for (const unit of units) {
		for (const { name } of unit.capabilities) {
			for (const dependency of byName.get(name)?.dependencies ?? []) {
				const owner = unitOfCapability.get(dependency);
				if (owner && owner !== unit.name && !unit.dependenciesOnOtherUnits.some(d => d.unitName === owner)) {
					unit.dependenciesOnOtherUnits.push({ unitName: owner, reason: `Consumes capability "${dependency}" owned by ${owner}.` });
				}
			}
		}
	}
	return units;
}

interface Refinement {
	unitRationales: { name: string; scopeRationale: string }[];
	deviations: UnitDeviation[];
	cohesionIssues: CohesionIssue[];
}

const REFINEMENT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['unitRationales', 'deviations', 'cohesionIssues'],
	properties: {
		unitRationales: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'scopeRationale'], properties: { name: { type: 'string' }, scopeRationale: { type: 'string' } } } },
		deviations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['unitName', 'decompositionRecommendation', 'actualGrouping', 'reason'], properties: { unitName: { type: 'string' }, decompositionRecommendation: { type: 'string' }, actualGrouping: { type: 'string' }, reason: { type: 'string' } } } },
		cohesionIssues: {
			type: 'array',
			description: 'Units where the mechanical clustering violates shared data ownership, shared consumer, or deployability. Empty if all units pass.',
			items: { type: 'object', additionalProperties: false, required: ['unitName', 'criterion', 'issue', 'recommendation'], properties: { unitName: { type: 'string' }, criterion: { type: 'string', enum: ['shared-data-ownership', 'shared-consumer', 'deployable-together'] }, issue: { type: 'string' }, recommendation: { type: 'string' } } }
		}
	}
};

/** What the locked strategy says, as far as the unit refinement needs it. */
export interface StrategyContext {
	recommendedStrategy: string;
	rationale: string;
	businessBoundaries: string[];
	tightlyCoupled: string[];
	modernizationBoundaries: { name: string; description: string; projects: string[]; justification?: string; migrationComplexity?: string }[];
}

/**
 * The clustering above is real code and stays as it is. Claude validates cohesion, writes grounded rationales and
 * records deviations from the decomposition strategy. Reasoning only, no file access.
 */
export function refineMigrationUnits(units: readonly GroupedUnit[], capabilities: readonly UnitCapability[], strategy: StrategyContext, signal: AbortSignal, onProcessStart: (kill: () => void) => void): Promise<Refinement> {
	const prompt = `A mechanical clustering algorithm has already grouped capabilities into migration units (by domain and shared-service arithmetic). Do NOT re-cluster; the unit membership is fixed. Your job is threefold:

1. Validate each unit's internal cohesion against the three grouping criteria below and surface real issues.
2. Write a grounded, specific scopeRationale for each unit citing actual capability names, personas, criticality, and businessOutcome, not a generic "N capabilities" sentence.
3. Compare this clustering against the locked Decomposition Strategy's modernization boundaries and record any real deviation.

---

## Decomposition Strategy Context
Recommended strategy: ${strategy.recommendedStrategy}
Rationale: ${strategy.rationale}
Business boundaries: ${strategy.businessBoundaries.join(', ') || 'None'}
Tightly coupled components: ${strategy.tightlyCoupled.join(', ') || 'None'}

## Full Capability Catalog (source of truth: use description, personas, criticality, businessOutcome to evaluate cohesion)
${JSON.stringify(capabilities, undefined, 2)}

## Migration Units (already clustered, do not change membership)
${JSON.stringify(units, undefined, 2)}

## Locked Decomposition Strategy's Modernization Boundaries
${JSON.stringify(strategy.modernizationBoundaries, undefined, 2)}

---

## Three Cohesion Criteria

For each unit, evaluate whether the mechanical domain-based clustering satisfies all three:

**1. Shared data ownership.** Capabilities in the unit should create or mutate the same core data entities. Look at each capability's description and businessOutcome for entity names. If capabilities in the same unit operate on clearly unrelated entities, flag it.

**2. Shared consumer.** Capabilities should be consumed by the same personas or teams. Compare the personas fields across capabilities in each unit. If the unit mixes capabilities only relevant to one persona with capabilities only relevant to another, flag it.

**3. Deployable together.** Capabilities in the same unit should be deliverable as a group without requiring another unit to be live first. A unit with hard runtime dependencies (dependenciesOnOtherUnits) on another unit cannot deploy independently; that is a sequencing risk, not a cohesion violation, so do not flag it here. Flag instead if two capabilities inside the SAME unit have a hard dependency on each other AND that dependency crosses what appear to be natural domain lines.

For each cohesion violation give: unitName, criterion (exactly one of "shared-data-ownership", "shared-consumer", "deployable-together"), issue (specific, citing the conflicting capability, persona or entity names) and recommendation (the most logical split or re-grouping if the issue is significant; otherwise "monitor in wave planning"). An empty cohesionIssues array is a valid and expected answer when the mechanical grouping is sound.

## Scope Rationale Instructions

For each unit (use the unit's exact name), write a scopeRationale that names 2 to 3 of the most important capabilities and what they collectively enable, references the shared persona(s) or data entity(s) that justify grouping them, mentions criticality if any capability is Critical or High, and is 1 to 2 sentences, specific to this unit.

## Deviation Instructions

Compare each unit against the modernizationBoundaries. A deviation exists when the clustering split what a boundary called a single unit, merged capabilities from two different boundaries, or put a capability in a domain that differs from the boundary's scope. An empty deviations array is valid if the clustering matches the boundaries.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
	return runClaudeSynthesis<Refinement>({ prompt, jsonSchema: REFINEMENT_SCHEMA, signal, onProcessStart }).then(refinement => ({
		unitRationales: refinement.unitRationales ?? [],
		deviations: refinement.deviations ?? [],
		cohesionIssues: refinement.cohesionIssues ?? []
	}));
}

/** The unit id the UI shows, from the planner's position. */
export function unitIdAt(index: number): string {
	return `UNIT-${String(index + 1).padStart(2, '0')}`;
}

/** The unit catalog as a Markdown file for the destination repo. */
export function buildMigrationUnitsCatalogMarkdown(params: {
	units: readonly GroupedUnit[];
	sharedServices: readonly SharedServiceCandidate[];
	unanalyzedCapabilities: readonly { seqNum: number; name: string; domain: string }[];
	deviations: readonly UnitDeviation[];
	cohesionIssues: readonly CohesionIssue[];
	groupingLabel: string;
}): string {
	const { units, sharedServices, unanalyzedCapabilities, deviations, cohesionIssues, groupingLabel } = params;
	const lines: string[] = ['# Migration Unit Catalog', '', '## Summary Table', '', `| # | Migration Unit | ${groupingLabel} | Capabilities | Scope | Key Dependencies |`, '|---|---|---|---|---|---|'];
	units.forEach((u, i) => {
		const dependencies = [...u.sharedServicesConsumed, ...u.dependenciesOnOtherUnits.map(d => d.unitName)].join(', ') || 'None';
		lines.push(`| ${i + 1} | ${u.name} | ${u.domain} | ${u.capabilities.map(c => c.name).join(', ')} | ${u.scopeEstimate} | ${dependencies} |`);
	});
	lines.push('', '## Shared Platform Services', '');
	if (sharedServices.length === 0) {
		lines.push('_No shared platform service candidates identified._', '');
	}
	for (const s of sharedServices) {
		lines.push(`### ${s.name}`, '', `**Dependent Capabilities:** ${s.dependentCount}`, '', `**Reason:** ${s.reason}`, '');
	}
	lines.push('## Migration Unit Details', '');
	units.forEach((u, i) => {
		lines.push(`### ${i + 1}. ${u.name}`, '', `**${groupingLabel}:** ${u.domain}`, '', `**Scope:** ${u.scopeEstimate} (${SCOPE_THRESHOLDS[u.scopeEstimate]})`, '', `**Scope Rationale:** ${u.scopeRationale}`, '', '**Capabilities:**', ...u.capabilities.map(c => `- [${c.seqNum}] ${c.name}`), '', `**Shared Services Consumed:** ${u.sharedServicesConsumed.join(', ') || 'None'}`, '');
		lines.push(u.dependenciesOnOtherUnits.length > 0 ? `**Dependencies on Other Migration Units:**\n${u.dependenciesOnOtherUnits.map(d => `- **${d.unitName}**: ${d.reason}`).join('\n')}` : '**Dependencies on Other Migration Units:** None', '');
	});
	lines.push('## Unanalyzed Capabilities', '');
	lines.push(unanalyzedCapabilities.length === 0 ? '_All capabilities were grouped into a migration unit or identified as a shared service._' : unanalyzedCapabilities.map(c => `- **[${c.seqNum}] ${c.name}** (${c.domain})`).join('\n'), '');
	lines.push('## Deviations from Decomposition Report', '');
	if (deviations.length === 0) {
		lines.push('_No deviations. Migration units follow the locked decomposition strategy directly._', '');
	}
	for (const d of deviations) {
		lines.push(`### ${d.unitName}`, '', `**Decomposition Report Recommendation:** ${d.decompositionRecommendation}`, '', `**Actual Grouping:** ${d.actualGrouping}`, '', `**Reason:** ${d.reason}`, '');
	}
	if (cohesionIssues.length > 0) {
		lines.push('## Cohesion Issues', '', '_These units have potential cohesion issues flagged by the analysis. They do not change unit membership but should be reviewed during wave planning._', '');
		for (const c of cohesionIssues) {
			lines.push(`### ${c.unitName}`, '', `**Criterion:** ${c.criterion}`, '', `**Issue:** ${c.issue}`, '', `**Recommendation:** ${c.recommendation}`, '');
		}
	}
	return lines.join('\n');
}

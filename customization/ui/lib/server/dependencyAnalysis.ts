import { runClaudeSynthesis } from './claudeCli';

export interface DependencyEdge {
	name: string;
	reason: string;
	isHardBlocker: boolean;
}

export interface Readiness {
	readinessScore: 'High' | 'Medium' | 'Low';
	readinessJustification: string;
	migrationBlockers: { blocker: string; origin: string; prerequisiteAction: string }[];
}

/** A migration unit or shared service with everything the analysis derives for it. */
export interface AnalysisTarget {
	name: string;
	type: 'migration-unit' | 'shared-service';
	upstreamDependencies: DependencyEdge[];
	downstreamDependents: { name: string; reason: string }[];
	migrationBlockers: Readiness['migrationBlockers'];
	readinessScore: Readiness['readinessScore'];
	readinessJustification: string;
	readinessSource: 'claude' | 'heuristic';
	wave: number | 'blocked';
}

const READINESS_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['readinessScore', 'readinessJustification', 'migrationBlockers'],
	properties: {
		readinessScore: { type: 'string', enum: ['High', 'Medium', 'Low'] },
		readinessJustification: { type: 'string' },
		migrationBlockers: {
			type: 'array',
			items: { type: 'object', additionalProperties: false, required: ['blocker', 'origin', 'prerequisiteAction'], properties: { blocker: { type: 'string' }, origin: { type: 'string' }, prerequisiteAction: { type: 'string' } } }
		}
	}
};

/**
 * The upstream edges are real, code-derived data (from the unit's shared services and cross-unit dependencies). This only
 * asks for grounded readiness reasoning and specific blockers given those edges. Reasoning only, no file access.
 */
export function assessReadiness(unitName: string, capabilityNames: readonly string[], upstream: readonly DependencyEdge[], signal: AbortSignal, onProcessStart: (kill: () => void) => void): Promise<Readiness> {
	const prompt = `Assess the migration readiness of one migration unit, grounded ONLY in the data below. Never invent a blocker that is not traceable to this unit's actual upstream dependencies.

## Unit
Name: ${unitName}
Capabilities: ${JSON.stringify(capabilityNames)}

## Upstream dependencies (already determined by real clustering; do not add or remove any)
${JSON.stringify(upstream, undefined, 2)}

## Readiness Level Definitions
- High: No unresolved blockers; data ownership is unambiguous; no shared tables without a defined migration path.
- Medium: One or two known, addressable blockers; partial shared infrastructure with a viable resolution plan.
- Low: Multiple unresolved blockers; fragmented data ownership; shared infrastructure with no defined resolution path.

## Instructions
- readinessScore: Apply the definitions above based on the nature of the blockers, not a raw count. A single hard blocker with no resolution path is Low; two soft dependencies with clear resolution plans is Medium.
- readinessJustification: One sentence citing the primary factor. Name the specific upstream dependency and why it determines the score (or confirm absence of blockers if none).
- migrationBlockers: One entry per upstream dependency that constitutes a real blocker (empty array if no upstream). Each entry must have:
  - blocker: what specifically is blocked and why (reference the dependency name and its stated reason)
  - origin: the exact dependency name this blocker originates from (for example if "${unitName}" depends on "X", the origin is "X"), not a generic filename
  - prerequisiteAction: a concrete, non-generic action naming the target, the specific coupling to resolve, and the mechanism (for example "Extract the T_USER ownership contract from X before this unit can own its own user records", not "Ensure X is verified and live")
  FORBIDDEN: generic actions like "Ensure X is verified", "Confirm X is live", "Validate X is complete".

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
	return runClaudeSynthesis<Readiness>({ prompt, jsonSchema: READINESS_SCHEMA, signal, onProcessStart });
}

/** The deterministic readiness used for a unit when Claude's assessment failed; the run log says so. */
export function heuristicReadiness(upstream: readonly DependencyEdge[]): Readiness {
	return {
		readinessScore: upstream.length === 0 ? 'High' : upstream.length <= 2 ? 'Medium' : 'Low',
		readinessJustification: upstream.length === 0 ? 'No unresolved upstream dependencies.' : `${upstream.length} upstream dependency(ies) must land first.`,
		migrationBlockers: upstream.slice(0, 3).map(edge => ({
			blocker: `Depends on "${edge.name}"`,
			origin: edge.name,
			prerequisiteAction: `Complete the migration of "${edge.name}" and confirm its interface before starting this unit.`
		}))
	};
}

/**
 * Fills in `downstreamDependents` (the reverse of upstream), assigns execution waves (0 without upstream, otherwise one
 * more than the latest upstream). Targets in a cycle get `blocked` and are returned as one group.
 */
export function assignWaves(targets: AnalysisTarget[]): string[][] {
	const byName = new Map(targets.map(target => [target.name, target]));
	for (const target of targets) {
		for (const edge of target.upstreamDependencies) {
			byName.get(edge.name)?.downstreamDependents.push({ name: target.name, reason: `"${target.name}" needs it to be migrated first.` });
		}
	}
	const remaining = new Set(targets.map(target => target.name));
	const waveOf = new Map<string, number>();
	let progressed = true;
	while (remaining.size > 0 && progressed) {
		progressed = false;
		for (const name of [...remaining]) {
			const target = byName.get(name)!;
			if (target.upstreamDependencies.every(edge => !remaining.has(edge.name) || edge.name === name)) {
				const upstreamWaves = target.upstreamDependencies.filter(edge => edge.name !== name).map(edge => waveOf.get(edge.name) ?? 0);
				waveOf.set(name, upstreamWaves.length === 0 ? 0 : Math.max(...upstreamWaves) + 1);
				remaining.delete(name);
				progressed = true;
			}
		}
	}
	for (const target of targets) {
		target.wave = remaining.has(target.name) ? 'blocked' : waveOf.get(target.name) ?? 0;
	}
	return remaining.size > 0 ? [[...remaining]] : [];
}

/** Dependencies that are not placed in an earlier wave than their dependent. Always empty unless the waves were tampered with. */
export function sequencingViolationsOf(targets: readonly AnalysisTarget[]): { target: string; issue: string }[] {
	const byName = new Map(targets.map(target => [target.name, target]));
	const violations: { target: string; issue: string }[] = [];
	for (const target of targets) {
		for (const edge of target.upstreamDependencies) {
			const upstream = byName.get(edge.name);
			if (upstream && upstream !== target && typeof upstream.wave === 'number' && typeof target.wave === 'number' && upstream.wave >= target.wave) {
				violations.push({ target: target.name, issue: `"${edge.name}" (wave ${upstream.wave}) does not precede "${target.name}" (wave ${target.wave}).` });
			}
		}
	}
	return violations;
}

function waveLabel(wave: number | 'blocked'): string {
	return wave === 'blocked' ? 'Blocked' : `Wave ${wave}`;
}

/** The dependency analysis as a Markdown file for the destination repo. */
export function buildDependencyAnalysisMarkdown(targets: readonly AnalysisTarget[], cycles: readonly string[][], sequencingViolations: readonly { target: string; issue: string }[]): string {
	const rank = (wave: number | 'blocked') => wave === 'blocked' ? Number.MAX_SAFE_INTEGER : wave;
	const sorted = [...targets].sort((a, b) => rank(a.wave) - rank(b.wave) || a.name.localeCompare(b.name));
	const lines: string[] = ['# Dependency Analysis and Modernization Readiness', '', '## Summary Table', '', '| Target | Type | Readiness | Wave | Key Blockers |', '|---|---|---|---|---|'];
	for (const t of sorted) {
		lines.push(`| ${t.name} | ${t.type} | ${t.readinessScore} | ${waveLabel(t.wave)} | ${t.migrationBlockers.slice(0, 2).map(b => b.blocker).join('; ') || 'None'} |`);
	}
	lines.push('', '## Migration Waves', '');
	for (const wave of [...new Set(sorted.map(t => t.wave).filter((w): w is number => w !== 'blocked'))].sort((a, b) => a - b)) {
		lines.push(`### Wave ${wave}`, '');
		for (const t of sorted.filter(x => x.wave === wave)) {
			lines.push(`- **${t.name}** (${t.type}): ${t.upstreamDependencies.length === 0 ? 'No upstream dependencies, can be extracted first.' : `Depends on ${t.upstreamDependencies.map(e => e.name).join(', ')}.`}`, `  _${t.readinessJustification}_`);
		}
		lines.push('');
	}
	const blocked = sorted.filter(t => t.wave === 'blocked');
	if (blocked.length > 0) {
		lines.push('### Blocked (Unresolved Cycles)', '', ...blocked.map(t => `- **${t.name}** (${t.type})`), '');
	}
	lines.push('## Target Dependency Details', '');
	for (const t of sorted) {
		lines.push(`### ${t.name}`, '', `**Type:** ${t.type} | **Wave:** ${waveLabel(t.wave)} | **Readiness:** ${t.readinessScore} (${t.readinessSource === 'claude' ? 'assessed by Claude' : 'deterministic rule'})`, '');
		lines.push(t.upstreamDependencies.length > 0 ? `**Upstream Dependencies:**\n${t.upstreamDependencies.map(e => `- **${e.name}** (${e.isHardBlocker ? 'hard blocker' : 'soft preference'}): ${e.reason}`).join('\n')}` : '**Upstream Dependencies:** None', '');
		lines.push(t.downstreamDependents.length > 0 ? `**Downstream Dependents:**\n${t.downstreamDependents.map(e => `- **${e.name}**: ${e.reason}`).join('\n')}` : '**Downstream Dependents:** None', '');
		for (const b of t.migrationBlockers) {
			lines.push(`- Blocker: ${b.blocker} (origin: ${b.origin}). Action: ${b.prerequisiteAction}`);
		}
		if (t.migrationBlockers.length > 0) {
			lines.push('');
		}
	}
	lines.push('## Dependency Graph', '', '_Each target and its direct upstream dependencies._', '');
	for (const t of sorted) {
		lines.push(`- **${t.name}** [${waveLabel(t.wave)}] → ${t.upstreamDependencies.length === 0 ? '_(no upstream dependencies)_' : t.upstreamDependencies.map(e => e.name).join(', ')}`);
	}
	lines.push('');
	if (cycles.length > 0) {
		lines.push('## Detected Cycles', '');
		cycles.forEach((cycle, i) => lines.push(`### Cycle ${i + 1}`, '', `**Involved targets:** ${cycle.join(', ')}`, ''));
	}
	if (sequencingViolations.length > 0) {
		lines.push('## Sequencing Violations', '', ...sequencingViolations.map(v => `- **${v.target}**: ${v.issue}`), '');
	}
	return lines.join('\n');
}

import { runClaude, runClaudeSynthesis } from './claudeCli';
import type { TargetStackEntry } from './targetCatalog';

/** A migration unit or shared service the milestones must cover, with its execution wave. */
export interface WaveTarget {
	name: string;
	type: 'migration-unit' | 'shared-service';
	wave: number;
}

/** What earlier steps established, handed to Claude as grounding. */
export interface MilestoneSources {
	units: { name: string; domain: string; wave: number | 'blocked' | null; scope: string; capabilities: string[]; dependsOn: string[]; blockers: string[]; readiness: string | null }[];
	sharedServices: { name: string; wave: number | 'blocked' | null; dependentCount: number; blockers: string[] }[];
	strategy: { executiveSummary: string; apiStrategyByWave: { wave: number; description: string }[] } | null;
	charter: { goals: { name: string; successIndicator: string }[]; constraints: { category: string; constraint: string }[] };
	gaps: { total: number; largeEffort: number; highFunctionalRisk: number };
}

/** One milestone of the plan, before it is stored. */
export interface DraftMilestone {
	milestoneId: string;
	wave: number;
	name: string;
	description: string;
	unitRefs: string[];
	dependencies: string[];
	estimatedEffort: string;
}

function milestoneIdAt(index: number): string {
	return `M-${String(index + 1).padStart(2, '0')}`;
}

/** The deterministic plan: one milestone per wave. Used when Claude's plan cannot be validated, and the run log says so. */
export function buildMilestones(targets: readonly WaveTarget[]): DraftMilestone[] {
	const waves = [...new Set(targets.map(t => t.wave))].sort((a, b) => a - b);
	return waves.map((wave, index) => {
		const inWave = targets.filter(t => t.wave === wave);
		return {
			milestoneId: milestoneIdAt(index),
			wave,
			name: wave === 0 ? 'Foundation' : `Wave ${wave}`,
			description: `Covers ${inWave.map(t => t.name).join(', ')}.`,
			unitRefs: inWave.map(t => t.name),
			dependencies: index === 0 ? [] : [milestoneIdAt(index - 1)],
			estimatedEffort: inWave.length <= 2 ? 'S' : inWave.length <= 4 ? 'M' : 'L'
		};
	});
}

interface MilestoneSynthesis {
	milestones: { name: string; description: string; wave: number; migrationUnitRefs: string[]; dependencies: string[]; estimatedEffort: string }[];
}

const STRINGS = { type: 'array', items: { type: 'string' } };
const TEXT = { type: 'string' };

function strictObject(properties: Record<string, object>): object {
	return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

const MILESTONE_SCHEMA = strictObject({
	milestones: {
		type: 'array',
		items: strictObject({
			name: { type: 'string', description: 'Short milestone name (3 to 6 words)' },
			description: { type: 'string', description: '1 to 2 sentences: what is BUILT or RESOLVED in this milestone' },
			wave: { type: 'number', description: 'The wave number this milestone belongs to (0 = Foundation)' },
			migrationUnitRefs: { type: 'array', items: { type: 'string' }, description: 'Exact migration unit or shared service names from the provided targets' },
			dependencies: { type: 'array', items: { type: 'string' }, description: '1-based positions (as strings, e.g. "1") of EARLIER milestones in this list this milestone depends on. Empty for the first.' },
			estimatedEffort: { type: 'string', description: 'Effort in days or weeks, e.g. "1 week", "3-4 days", "2-3 weeks"' }
		})
	}
});

function buildPrompt(sources: MilestoneSources, targets: readonly WaveTarget[]): string {
	return `You are synthesizing the milestone hub index for a parallel-build migration. Each row is one trackable milestone; deep analyses will later explore each in detail.

## Source summaries (from the project's own migration artifacts)

### Migration Strategy
${JSON.stringify(sources.strategy, undefined, 2)}

### Migration Units
${JSON.stringify(sources.units, undefined, 2)}

### Shared Platform Services
${JSON.stringify(sources.sharedServices, undefined, 2)}

### Modernization Charter
${JSON.stringify(sources.charter, undefined, 2)}

### Gap Analysis summary
${JSON.stringify(sources.gaps, undefined, 2)}

### Targets that MUST each appear in exactly one milestone's migrationUnitRefs (name, type, wave)
${JSON.stringify(targets, undefined, 2)}

---

## Your Task
Produce a complete, ordered list of milestones following these rules:

1. Align milestones with the migration waves from the dependency analysis (Wave 0 = Foundation). Group a wave's targets into 1 to 3 milestones by theme and dependency; never mix targets from different waves in one milestone.
2. Derive dependencies from wave ordering and the units' own upstream dependencies. Foundation milestones have no upstream dependencies; later waves depend on the earlier-wave milestones that contain the units they depend on. A milestone may only depend on EARLIER milestones in the list. Express each dependency as the 1-based position of that milestone in your list, as a string.
3. Estimate effort in days or weeks using unit scope, blocker count and gap counts (more blockers or large-effort gaps mean more effort).
4. migrationUnitRefs must use the exact target names above; every target appears in exactly one milestone.
5. Target 8 to 16 milestones total for a large project, fewer for a small one. Never one milestone per gap or per capability.
6. Each description must state what is BUILT or RESOLVED, not just which wave it belongs to. Good: "Scaffold the app shell, wire the data layer to the existing schema, and stand up the background-job worker." Bad: "Foundation infrastructure work."
7. Respect the charter's constraints and any security prerequisites; resolve them early.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
}

/**
 * Claude's milestone plan. Throws when the plan cannot be reconciled with the real targets (an unknown name, a target in
 * two milestones, an uncovered target), so the caller can fall back to the per-wave plan and say so.
 */
export async function buildMilestonesWithClaude(sources: MilestoneSources, targets: readonly WaveTarget[], signal: AbortSignal, onProcessStart: (kill: () => void) => void): Promise<DraftMilestone[]> {
	const result = await runClaudeSynthesis<MilestoneSynthesis>({ prompt: buildPrompt(sources, targets), jsonSchema: MILESTONE_SCHEMA, signal, onProcessStart });
	const waveByTarget = new Map(targets.map(t => [t.name, t.wave]));
	const seen = new Set<string>();
	for (const milestone of result.milestones ?? []) {
		for (const ref of milestone.migrationUnitRefs) {
			if (!waveByTarget.has(ref)) {
				throw new Error('The milestone plan named an unknown target.');
			}
			if (seen.has(ref)) {
				throw new Error('The milestone plan assigned a target to two milestones.');
			}
			seen.add(ref);
		}
	}
	if (targets.some(t => !seen.has(t.name))) {
		throw new Error('The milestone plan left a target uncovered.');
	}
	const populated = result.milestones.filter(m => m.migrationUnitRefs.length > 0);
	// Order by wave (stable), so ids follow execution order and dependencies point backwards.
	const ordered = populated
		.map((milestone, originalIndex) => ({ milestone, originalIndex, wave: Math.max(...milestone.migrationUnitRefs.map(ref => waveByTarget.get(ref) as number)) }))
		.sort((a, b) => a.wave - b.wave || a.originalIndex - b.originalIndex);
	const newIdByOriginal = new Map(ordered.map((entry, index) => [entry.originalIndex, milestoneIdAt(index)]));
	return ordered.map((entry, index) => {
		const id = milestoneIdAt(index);
		const dependencies = [...new Set(entry.milestone.dependencies
			.map(position => Number(String(position).replace(/^M-0*/, '')) - 1)
			.map(original => newIdByOriginal.get(original))
			.filter((dependency): dependency is string => !!dependency && dependency < id))];
		return { milestoneId: id, wave: entry.wave, name: entry.milestone.name.trim() || `Wave ${entry.wave}`, description: entry.milestone.description, unitRefs: entry.milestone.migrationUnitRefs, dependencies, estimatedEffort: entry.milestone.estimatedEffort };
	});
}

/** The reviewer's view of a milestone in the plan file. */
export interface MilestoneRow extends DraftMilestone {
	locked: boolean;
}

/** The milestone plan as a Markdown file for the destination repo. */
export function buildMilestonesMarkdown(milestones: readonly MilestoneRow[]): string {
	const header = '| Milestone ID | Name | Description | Status | Migration Unit(s) | Dependencies | Estimated Effort |';
	const separator = '| --- | --- | --- | --- | --- | --- | --- |';
	const row = (m: MilestoneRow) => `| ${m.milestoneId} | ${m.name} | ${m.description.replace(/\|/g, '/')} | ${m.locked ? 'Locked' : 'Draft'} | ${m.unitRefs.join(', ')} | ${m.dependencies.join(', ') || 'None'} | ${m.estimatedEffort} |`;
	const lines = ['# Migration Milestones', '', '> **Hub Index:** each milestone row can be explored in detail by a deep analysis, then broken into stories and tasks.', '', '## Summary', '', `- **Total milestones:** ${milestones.length}`, '', header, separator, ...milestones.map(row), '', '## Milestones by Wave', ''];
	for (const wave of [...new Set(milestones.map(m => m.wave))].sort((a, b) => a - b)) {
		lines.push(`### ${wave === 0 ? 'Foundation' : `Wave ${wave}`}`, '', header, separator, ...milestones.filter(m => m.wave === wave).map(row), '');
	}
	return lines.join('\n');
}

/** The deep analysis of one milestone, as Claude returns it. */
export interface MilestoneDeepAnalysis {
	currentStateInventory: { file: string; role: string }[];
	targetArchitectureMapping: { sourceConcept: string; targetShellOrFile: string; notes: string }[];
	gapsAndRisks: { risk: string; functionalRisk: 'Critical' | 'High' | 'Medium' | 'Low' }[];
	sequencingSteps: string[];
	definitionOfDone: string[];
}

const DEEP_ANALYSIS_SCHEMA = strictObject({
	currentStateInventory: { type: 'array', items: strictObject({ file: TEXT, role: TEXT }) },
	targetArchitectureMapping: { type: 'array', items: strictObject({ sourceConcept: TEXT, targetShellOrFile: TEXT, notes: TEXT }) },
	gapsAndRisks: { type: 'array', items: strictObject({ risk: TEXT, functionalRisk: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] } }) },
	sequencingSteps: STRINGS,
	definitionOfDone: STRINGS
});

function buildDeepAnalysisPrompt(milestoneName: string, targetNames: readonly string[], stack: TargetStackEntry): string {
	return `You are producing a deep-analysis document for one migration milestone within a real codebase, rooted at the current working directory. Read the actual files (Read/Glob/Grep only, no write access) relevant to this milestone's scope.

Milestone: "${milestoneName}", covers: ${JSON.stringify(targetNames)}

Locked target stack (map TO this, using its real vocabulary, never assume any other framework):
${JSON.stringify(stack, undefined, 2)}

IMPORTANT: work efficiently.
- Never glob or read inside: node_modules, vendor, .git, log, logs, tmp, dist, build, coverage, .next, target, bin, obj.
- Prefer targeted patterns over a broad "**/*" or "*" at the repo root.
- Aim to complete your investigation in roughly 15 to 25 tool calls, focused on files relevant to this milestone's targets.

Produce, grounded ONLY in what you actually find:

1. currentStateInventory: real files relevant to this milestone's scope, each with a one-line role description.
2. targetArchitectureMapping: for each significant source concept (a module, route or component you found), what it maps to in the target stack (using the target stack's real routing and architecture vocabulary, never assume file-based routing unless the target stack implies it), with brief notes.
3. gapsAndRisks: concrete risks in migrating this scope, each with a functional risk rating, grounded in what you observed (not generic concerns).
4. sequencingSteps: a real, ordered list of steps to execute this milestone, grounded in the actual dependencies you observed between the files and concepts above.
5. definitionOfDone: concrete, verifiable completion criteria for this milestone.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
}

/** Explores the sub-project read-only and maps one milestone's real scope to the locked target stack. */
export function analyzeMilestoneDeeply(options: { absolutePath: string; milestoneName: string; targetNames: readonly string[]; stack: TargetStackEntry; signal: AbortSignal; onEvent: (type: string, message: string) => void; onProcessStart: (kill: () => void) => void }): Promise<MilestoneDeepAnalysis> {
	return runClaude<MilestoneDeepAnalysis>({
		prompt: buildDeepAnalysisPrompt(options.milestoneName, options.targetNames, options.stack),
		jsonSchema: DEEP_ANALYSIS_SCHEMA,
		cwd: options.absolutePath,
		signal: options.signal,
		onEvent: options.onEvent,
		onProcessStart: options.onProcessStart
	});
}

/** Where one milestone's deep analysis is written, relative to the destination folder. */
export function milestoneAnalysisFile(milestoneId: string): string {
	return `migration/milestones/${milestoneId}-deep-analysis.md`;
}

/** One milestone's deep analysis as a Markdown file for the destination repo. */
export function buildMilestoneDeepAnalysisMarkdown(milestoneId: string, name: string, data: MilestoneDeepAnalysis): string {
	const lines = [`# ${milestoneId}: ${name} (Deep Analysis)`, '', '---', '', '## Section 1: Current State Inventory', '', '| File | Role |', '|---|---|'];
	lines.push(...data.currentStateInventory.map(f => `| \`${f.file}\` | ${f.role} |`), '', '## Section 2: Target Architecture Mapping', '', '| Source Concept | Target | Notes |', '|---|---|---|');
	lines.push(...data.targetArchitectureMapping.map(m => `| ${m.sourceConcept} | ${m.targetShellOrFile} | ${m.notes} |`), '', '## Section 3: Gap and Risk Assessment', '', '| Risk | Functional Risk |', '|---|---|');
	lines.push(...data.gapsAndRisks.map(g => `| ${g.risk} | ${g.functionalRisk} |`), '', '## Section 4: Recommended Sequencing', '');
	lines.push(...data.sequencingSteps.map((s, i) => `${i + 1}. ${s}`), '', '## Section 5: Definition of Done', '');
	lines.push(...data.definitionOfDone.map(d => `- [ ] ${d}`), '');
	return lines.join('\n');
}

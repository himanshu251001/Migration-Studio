import { runClaudeSynthesis } from './claudeCli';
import type { TargetStackEntry } from './targetCatalog';

/** The categories of legacy pattern the mapping library covers. Each is one mapping the reviewer approves. */
export const MAPPING_CATEGORIES = ['state-pattern', 'orm-model', 'controller-action', 'serializer', 'background-job', 'auth-mechanism', 'routing'] as const;

export type MappingCategory = (typeof MAPPING_CATEGORIES)[number];

/** One legacy pattern and the target idiom that replaces it. */
export interface MappingEntry {
	category: MappingCategory;
	legacyPattern: string;
	targetPattern: string;
	description: string;
	example: string;
}

/** What the mapping prompt needs of one analyzed sub-project. */
export interface MappingSubProject {
	subProjectPath: string;
	framework: string;
	architecture: { modules: string[]; interfaces: string[]; integrations: string[] };
	data: { technologies: string[] };
	dependencies: { upstream: string[]; downstream: string[] };
	users: { roles: string[]; permissions: string[] };
}

const LEGACY_LABELS: Record<MappingCategory, string> = {
	'state-pattern': 'client state store',
	'orm-model': 'ORM model',
	'controller-action': 'controller action',
	serializer: 'response serializer',
	'background-job': 'background job',
	'auth-mechanism': 'auth/session mechanism',
	routing: 'route table'
};

/** The source stack's name, from the frameworks the analysis found. */
export function sourceStackName(frameworks: readonly string[]): string {
	return [...new Set(frameworks.map(f => f.trim()).filter(Boolean))].join(' + ') || 'the legacy application';
}

/**
 * The deterministic mapping, derived from the target stack's own catalog fields. It is a placeholder (no example, generic
 * legacy patterns), used only when Claude's draft fails, and the run log says so.
 */
export function proposeMappingEntries(sourceStack: string, target: TargetStackEntry): MappingEntry[] {
	const targetPatternFor: Record<MappingCategory, string> = {
		'orm-model': target.dataAccess,
		'auth-mechanism': target.auth,
		'background-job': target.backgroundJobs,
		routing: target.routing,
		'controller-action': target.routing,
		'state-pattern': `${target.language} state layer for a ${target.architecturePattern}`,
		serializer: `${target.language} response-shaping layer for a ${target.architecturePattern}`
	};
	return MAPPING_CATEGORIES.map(category => ({
		category,
		legacyPattern: `${sourceStack} ${LEGACY_LABELS[category]}`,
		targetPattern: targetPatternFor[category],
		description: `Maps each ${LEGACY_LABELS[category]} in ${sourceStack} to ${targetPatternFor[category]} in ${target.name}.`,
		example: ''
	}));
}

const MAPPING_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['entries'],
	properties: {
		entries: {
			type: 'array',
			minItems: MAPPING_CATEGORIES.length,
			maxItems: MAPPING_CATEGORIES.length,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['category', 'legacyPattern', 'targetPattern', 'description', 'example'],
				properties: {
					category: { type: 'string', enum: [...MAPPING_CATEGORIES] },
					legacyPattern: { type: 'string' },
					targetPattern: { type: 'string' },
					description: { type: 'string' },
					example: { type: 'string' }
				}
			}
		}
	}
};

/** Asks Claude for one grounded entry per category, from the discovered source code and the target's catalog entry. */
export async function proposeMappingEntriesWithClaude(sourceStack: string, subProjects: readonly MappingSubProject[], target: TargetStackEntry, signal: AbortSignal, onProcessStart: (kill: () => void) => void): Promise<MappingEntry[]> {
	const prompt = `You are building a reusable "legacy pattern to target pattern" mapping library for a migration from "${sourceStack}" to "${target.name}". A code-writing agent will read it later, so every entry must be concrete and grounded, never generic filler.

## Discovered source-side code (source of truth for legacyPattern; never invent a pattern not traceable to this data)
${JSON.stringify(subProjects, undefined, 2)}

## Target stack catalog entry (source of truth for targetPattern and example; use ONLY this stack's real vocabulary)
${JSON.stringify(target, undefined, 2)}

## Categories: exactly one entry per category
${MAPPING_CATEGORIES.map(c => `- ${c}`).join('\n')}

## Instructions
For each category:
- legacyPattern: the REAL pattern found in the discovery data (a real ORM or data-access style, a real auth mechanism, a real routing style), citing specifics, not a generic label.
- targetPattern: the equivalent idiom in "${target.name}", grounded in its routing, dataAccess, auth, backgroundJobs and architecturePattern fields.
- description: one sentence explaining the mapping.
- example: a short, concrete code-ish snippet (pseudocode is fine) showing the TARGET-side idiom in practice, in ${target.name}'s real vocabulary. Never leave it empty.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
	const result = await runClaudeSynthesis<{ entries: MappingEntry[] }>({ prompt, jsonSchema: MAPPING_SCHEMA, signal, onProcessStart });
	const byCategory = new Map(result.entries.map(entry => [entry.category, entry]));
	const missing = MAPPING_CATEGORIES.filter(category => !byCategory.has(category));
	if (missing.length > 0) {
		throw new Error(`Missing mapping categories: ${missing.join(', ')}`);
	}
	return MAPPING_CATEGORIES.map(category => byCategory.get(category)!);
}

/** The mapping library as a Markdown file for the destination repo. */
export function buildMappingLibraryMarkdown(entries: readonly MappingEntry[], sourceStack: string, targetStackName: string): string {
	const lines: string[] = [`# Pattern Mapping Library: ${sourceStack} to ${targetStackName}`, '', 'Reusable legacy-pattern to target-pattern entries for this source and target pair. A code-writing agent reads them so implementation stays idiomatic and consistent across tasks.', ''];
	for (const entry of entries) {
		lines.push(`## ${entry.category}`, '', `**Legacy pattern:** ${entry.legacyPattern}`, '', `**Target pattern:** ${entry.targetPattern}`, '', `**Description:** ${entry.description}`, '');
		if (entry.example) {
			lines.push('**Example:**', '', '```', entry.example, '```', '');
		}
	}
	return lines.join('\n');
}

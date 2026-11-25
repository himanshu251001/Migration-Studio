import { runClaude } from './claudeCli';
import type { TargetStackEntry } from './targetCatalog';

/** One real gap between the legacy application and the target stack. Stored as received. */
export interface GapRecord {
	category: string;
	title: string;
	existingImplementation: string;
	requiredImplementation: string;
	uiParityRisk: 'High' | 'Medium' | 'Low';
	functionalParityRisk: 'High' | 'Medium' | 'Low';
	effort: 'Small' | 'Medium' | 'Large';
	recommendedOptions: { option: string; description: string; tradeoffs: string; recommended: boolean }[];
}

/** What earlier steps already established; handed to Claude as grounding so it does not re-derive it. */
export interface GapContext {
	sourceSubProjects: { subProjectPath: string; framework: string }[];
	migrationUnits: { name: string; domain: string }[];
	sharedServices: { name: string; reason: string }[];
	decompositionBoundaries: { name: string; description: string }[];
}

const BASELINE_CATEGORIES = [
	'UI Components & Layouts', 'Routing & Navigation', 'Authentication & Authorization', 'State Management', 'API Integration & Data Fetching',
	'Forms & Validation', 'File Upload & Asset Management', 'Background Jobs & Async Processing', 'External Integrations', 'Role-Based Access Control',
	'Error Handling & Loading States', 'Pagination & Data Presentation', 'Search & Filtering', 'Reporting & Export', 'Data Model & Persistence',
	'Notifications & Messaging', 'Build, Deploy & Infrastructure'
];

const RISK = { type: 'string', enum: ['High', 'Medium', 'Low'] };
const TEXT = { type: 'string' };

const GAP_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['gaps'],
	properties: {
		gaps: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['category', 'title', 'existingImplementation', 'requiredImplementation', 'uiParityRisk', 'functionalParityRisk', 'effort', 'recommendedOptions'],
				properties: {
					category: TEXT, title: TEXT, existingImplementation: TEXT, requiredImplementation: TEXT, uiParityRisk: RISK, functionalParityRisk: RISK,
					effort: { type: 'string', enum: ['Small', 'Medium', 'Large'] },
					recommendedOptions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['option', 'description', 'tradeoffs', 'recommended'], properties: { option: TEXT, description: TEXT, tradeoffs: TEXT, recommended: { type: 'boolean' } } } }
				}
			}
		}
	}
};

function buildPrompt(context: GapContext, stack: TargetStackEntry, architectureOption: string, dbDecision: string, strategy: string): string {
	return `You are a senior modernization engineer conducting a gap analysis for a real codebase, rooted at the current working directory, that is migrating to a target stack. Read the actual files (Read/Glob/Grep only, no write access) to ground every gap in what you actually find. Generic descriptions ("needs to be reimplemented") are not acceptable.

## Already known from earlier planning steps
${JSON.stringify(context, undefined, 2)}

## Proposed target-stack decision for this migration
Target stack: ${JSON.stringify(stack, undefined, 2)}
Architecture option: ${architectureOption}
Database decision: ${dbDecision}
Rollout strategy: ${strategy}

IMPORTANT: work efficiently, this repo may be large.
- Never glob or read inside: node_modules, vendor, .git, log, logs, tmp, dist, build, coverage, .next, target, bin, obj.
- Prefer targeted patterns over a broad "**/*" at the repo root.
- Aim to finish in roughly 20 to 30 tool calls, focused on real surface area (routes, components/views, forms, auth, data access, background jobs, integrations) rather than every file.

## Task
Identify every real gap (missing UI surface, API contract, integration or behaviour) that must be closed before the target stack reaches parity with the existing application. Use this baseline category set where it genuinely applies:
${BASELINE_CATEGORIES.map(c => `- ${c}`).join('\n')}

If you find a real gap that fits no baseline category, add a clearly named project-specific category instead of force-fitting it. Do not invent a gap just to cover a category that does not apply.

For each gap produce:
1. category: a baseline category above, or a project-specific one you named.
2. title: a 5 to 10 word label for the specific gap.
3. existingImplementation: real file path(s), class or function names from the current codebase. Never a generic claim.
4. requiredImplementation: what must be built, in the target stack's own vocabulary above (its real routing, dataAccess, auth and backgroundJobs terms). Never suggest a technology the decision does not imply.
5. uiParityRisk and functionalParityRisk: High, Medium or Low, grounded in what you observed. If you cannot determine a risk from the evidence, rate it High and say so in the relevant implementation field.
6. effort: Small (1 day or less), Medium (2 to 5 days) or Large (1 to 2 weeks).
7. recommendedOptions: 2 to 3 concretely different ways to close this gap, each with a real description and honest tradeoffs. Mark exactly ONE recommended: true, the one you would actually advise, and the rest false.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
}

/** Explores the source read-only and lists the gaps against the proposed target. */
export async function analyzeGaps(options: { absolutePath: string; context: GapContext; stack: TargetStackEntry; architectureOption: string; dbDecision: string; strategy: string; signal: AbortSignal; onEvent: (type: string, message: string) => void; onProcessStart: (kill: () => void) => void }): Promise<GapRecord[]> {
	const result = await runClaude<{ gaps: GapRecord[] }>({
		prompt: buildPrompt(options.context, options.stack, options.architectureOption, options.dbDecision, options.strategy),
		jsonSchema: GAP_SCHEMA,
		cwd: options.absolutePath,
		signal: options.signal,
		onEvent: options.onEvent,
		onProcessStart: options.onProcessStart
	});
	return result.gaps ?? [];
}

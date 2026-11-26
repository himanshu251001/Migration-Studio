import { runClaudeSynthesis } from './claudeCli';
import { slugify } from './projectWorkspace';

type Effort = 'XS' | 'S' | 'M' | 'L' | 'XL';
const EFFORTS: readonly Effort[] = ['XS', 'S', 'M', 'L', 'XL'];

/** The layers a task belongs to, and the layer group each one sorts under. */
export const LAYERS = ['Frontend', 'API', 'Data', 'Jobs', 'Infrastructure', 'Design', 'Cross-cutting', 'Documentation'] as const;
export type Layer = (typeof LAYERS)[number];

const LAYER_GROUP: Record<Layer, string> = { Data: 'LG1', Infrastructure: 'LG1', API: 'LG2', Jobs: 'LG2', Design: 'LG3', Frontend: 'LG3', 'Cross-cutting': 'LG4', Documentation: 'LG4' };

export interface StoryRecord {
	storyId: string;
	title: string;
	persona: string;
	goal: string;
	benefit: string;
	scope: string[];
	outOfScope: string[];
	acceptanceCriteria: string[];
	dependencies: string[];
	effort: Effort;
	legacyRef: string | null;
}

export interface TaskRecord {
	taskId: string;
	layerGroup: string;
	layer: Layer;
	title: string;
	scope: string;
	artifacts: string[];
	acceptanceCriteria: string[];
	dependencies: string[];
	legacyReference: string | null;
	gapRefs: string[];
	estimateDays: number;
}

export interface ReviewFinding {
	category: string;
	severity: 'Critical' | 'Major' | 'Minor';
	/** The story or task the finding is about, or `null` when it is about the set as a whole. */
	itemId: string | null;
	summary: string;
}

export type ReviewVerdict = 'Approved' | 'ApprovedWithMinorRevisions' | 'NeedsRevision';

export interface StoryReviewResult {
	verdict: ReviewVerdict;
	findings: ReviewFinding[];
}

/** A story with the tasks written for it and the independent review of those tasks. */
export interface StoryWithTasks extends StoryRecord {
	tasks: TaskRecord[];
	/** Whether Claude wrote the tasks or the layer template did. */
	taskSource: 'claude' | 'deterministic';
	taskReview: StoryReviewResult | null;
}

export interface GapRef {
	gapId: string;
	title: string;
	category: string;
}

/** What the prompts need of one analyzed sub-project. */
export interface StorySubProject {
	subProjectPath: string;
	technicalDebt: string[];
	personas: string[];
}

export interface MilestoneStoryContext {
	milestone: { milestoneId: string; name: string; description: string; unitRefs: string[]; deepAnalysis: unknown };
	targets: unknown[];
	analyses: StorySubProject[];
	legacyRefByTarget: Record<string, string | null>;
	gaps: GapRef[];
	mappings: { category: string; legacyPattern: string; targetPattern: string }[];
}

/** What Claude calls need to stop the run and report on it. */
export interface CallOptions {
	signal: AbortSignal;
	onProcessStart: (kill: () => void) => void;
}

const PERSONA_BY_HINT: readonly [RegExp, string][] = [[/admin|configuration|management/i, 'Admin'], [/auth|session|login/i, 'Employee'], [/report|search|listing/i, 'Practice Owner']];

function personaFor(name: string, fallback: readonly string[]): string {
	return PERSONA_BY_HINT.find(([pattern]) => pattern.test(name))?.[1] ?? fallback[0] ?? 'Employee';
}

/** The defect rule is code, not model output: a legacy defect is never fixed in place, only reframed as "does not reproduce". */
function defectCriterion(debtItem: string | undefined): string[] {
	return debtItem ? [`The replacing implementation does not reproduce: "${debtItem}" (do-not-carry-forward, not an in-place legacy fix).`] : [];
}

/** The deterministic fallback: one story per target. */
export function buildStories(milestoneId: string, targetNames: readonly string[], analyses: readonly StorySubProject[], legacyRefByTarget: Record<string, string | null>): StoryRecord[] {
	const debt = analyses.flatMap(a => a.technicalDebt);
	const personas = analyses.flatMap(a => a.personas);
	return targetNames.map((name, index) => ({
		storyId: `US-${milestoneId}-${index + 1}`,
		title: name,
		persona: personaFor(name, personas),
		goal: `${name.toLowerCase()} works in the migrated target`,
		benefit: `I can rely on "${name}" without falling back to the legacy application`,
		scope: [`Implement "${name}" in the target codebase`, 'Verify parity against the legacy sub-project'],
		outOfScope: ['Modifying the legacy sub-project (read-only reference only)'],
		acceptanceCriteria: [
			`The "${name}" capability is available end-to-end in the target codebase.`,
			"Response and UI shape matches the legacy sub-project's behavior for this capability.",
			...defectCriterion(debt[index % Math.max(debt.length, 1)])
		],
		dependencies: index === 0 ? [] : [`US-${milestoneId}-1`],
		effort: EFFORTS[index % EFFORTS.length],
		legacyRef: legacyRefByTarget[name] ?? null
	}));
}

const STRINGS = { type: 'array', items: { type: 'string' } };

function strictObject(properties: Record<string, object>): object {
	return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

const STORIES_SCHEMA = strictObject({
	stories: {
		type: 'array',
		items: strictObject({
			title: { type: 'string', description: 'Short story title, unique within the milestone' },
			persona: { type: 'string' },
			goal: { type: 'string', description: 'What the story delivers in the target application' },
			benefit: { type: 'string', description: 'Why it matters to the persona' },
			scope: { ...STRINGS, description: '2-5 concrete in-scope bullets' },
			outOfScope: STRINGS,
			acceptanceCriteria: { ...STRINGS, description: '3-6 observable, verifiable criteria. NOT the do-not-carry-forward defect line, that is appended separately.' },
			effort: { type: 'string', enum: [...EFFORTS] },
			covers: { ...STRINGS, description: 'Exact target names (from the provided targets) whose scope this story delivers or contributes to' },
			dependsOn: { ...STRINGS, description: 'Titles of EARLIER stories in this list that must complete first. Empty if independent.' }
		})
	}
});

interface StoryDraft {
	title: string;
	persona: string;
	goal: string;
	benefit: string;
	scope: string[];
	outOfScope: string[];
	acceptanceCriteria: string[];
	effort: Effort;
	covers: string[];
	dependsOn: string[];
}

function buildStoriesPrompt(ctx: MilestoneStoryContext, corrective: string | null): string {
	const { milestone } = ctx;
	return `You are writing the user stories for ONE milestone of a parallel-build migration. The legacy application is a read-only oracle: no story may require modifying it. All deliverables land in the target application.

## Binding constraints
- No story's scope, acceptance criteria or goal may require modifying the legacy application. Legacy paths appear only as things to READ for parity.
- A legacy defect becomes "does not reproduce in the target implementation", never an in-place fix.

## Milestone
ID: ${milestone.milestoneId}
Name: ${milestone.name}
Description: ${milestone.description}

## Targets in this milestone (migration units and shared services, with capabilities, blockers, dependencies, scope)
${JSON.stringify(ctx.targets, undefined, 2)}

## Known legacy source paths per target (null = net-new)
${JSON.stringify(ctx.legacyRefByTarget, undefined, 2)}

## Milestone deep analysis (current-state inventory, target mapping, risks, sequencing, definition of done), when available
${milestone.deepAnalysis ? JSON.stringify(milestone.deepAnalysis, undefined, 2) : '(not generated: derive scope from the targets above)'}

## Approved legacy to target mapping rules
${ctx.mappings.length ? JSON.stringify(ctx.mappings, undefined, 2) : '(none approved)'}

## Gap catalog (id | category | title): account for the relevant ones in scope and acceptance criteria
${ctx.gaps.length ? ctx.gaps.map(g => `${g.gapId} | ${g.category} | ${g.title}`).join('\n') : '(no gap analysis)'}

## Sub-project context (personas, technical debt)
${JSON.stringify(ctx.analyses, undefined, 2)}

## Instructions
Produce the COMPLETE set of stories needed to deliver this milestone and meet its definition of done. You decide how many; do NOT produce one story per target by default.
- Write vertical slices: each story is independently deliverable and verifiable by one persona, small enough for a developer to finish in a few days. Split a large target into several stories (per page, flow, endpoint or capability); a story may also span several small targets when they ship together. Typically 3 to 8 stories for a milestone, scaled to the real scope.
- EVERY target name must appear in the "covers" of at least one story, and every item of the deep analysis' definition of done (when present) must be satisfied by at least one story's acceptance criteria.
- persona: a real role from the sub-project data's personas, never invent one.
- Order stories so foundations come first; "dependsOn" lists only EARLIER story titles, and only real functional dependencies.
- effort is relative within this milestone (XS < S < M < L < XL).
${corrective ? `\n## Correction required\n${corrective}\n` : ''}
Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
}

/**
 * Claude's story set for one milestone. Validates that every target is covered and repairs the dependencies; one
 * corrective retry, then throws so the caller falls back to the per-target stories and says so.
 */
export async function buildStoriesWithClaude(ctx: MilestoneStoryContext, options: CallOptions): Promise<StoryRecord[]> {
	const { milestoneId, unitRefs } = ctx.milestone;
	let corrective: string | null = null;
	let lastError = 'no stories';
	for (let attempt = 0; attempt < 2; attempt++) {
		const result = await runClaudeSynthesis<{ stories: StoryDraft[] }>({ prompt: buildStoriesPrompt(ctx, corrective), jsonSchema: STORIES_SCHEMA, ...options });
		const drafts = (result.stories ?? []).filter(s => s.title?.trim());
		const covered = new Set(drafts.flatMap(s => s.covers));
		const uncovered = unitRefs.filter(target => !covered.has(target));
		if (drafts.length === 0) {
			lastError = 'Claude returned no stories';
		} else if (uncovered.length > 0) {
			lastError = `targets not covered: ${uncovered.join(', ')}`;
		} else {
			const debt = ctx.analyses.flatMap(a => a.technicalDebt);
			const indexByTitle = new Map(drafts.map((d, i) => [d.title.trim().toLowerCase(), i + 1]));
			return drafts.map((d, i) => ({
				storyId: `US-${milestoneId}-${i + 1}`,
				title: d.title.trim(),
				persona: d.persona,
				goal: d.goal,
				benefit: d.benefit,
				scope: d.scope,
				outOfScope: d.outOfScope.length ? d.outOfScope : ['Modifying the legacy sub-project (read-only reference only)'],
				acceptanceCriteria: [...d.acceptanceCriteria, ...defectCriterion(debt[i % Math.max(debt.length, 1)])],
				// Only earlier stories: a dependency on a later or the same story would be a cycle.
				dependencies: [...new Set(d.dependsOn.map(title => indexByTitle.get(title.trim().toLowerCase())).filter((n): n is number => !!n && n < i + 1).map(n => `US-${milestoneId}-${n}`))],
				effort: EFFORTS.includes(d.effort) ? d.effort : 'M',
				legacyRef: d.covers.map(c => ctx.legacyRefByTarget[c]).find((ref): ref is string => !!ref) ?? null
			}));
		}
		corrective = `Your previous answer was rejected: ${lastError}. Fix this and return the full corrected story set.`;
	}
	throw new Error('Story generation failed validation.');
}

const TASKS_SCHEMA = strictObject({
	tasks: {
		type: 'array',
		items: strictObject({
			layer: { type: 'string', enum: [...LAYERS] },
			title: { type: 'string', description: 'Short task title, unique within the story' },
			scope: { type: 'string', description: 'One concrete sentence naming the file, route or component this task delivers' },
			artifacts: { ...STRINGS, description: 'Paths of target files to create or modify' },
			acceptanceCriteria: { ...STRINGS, description: '1-3 observable criteria. NOT legacy-parity criteria, those are appended separately by the caller.' },
			dependsOn: { ...STRINGS, description: 'Titles of EARLIER tasks in this list this one depends on' },
			estimateDays: { type: 'number', description: 'Developer-days, 0.5-3' },
			gapRefs: { ...STRINGS, description: 'Gap IDs from the provided gap list ONLY whose description overlaps this task. Empty array if none apply; never invent IDs.' }
		})
	}
});

interface TaskDraft {
	layer: Layer;
	title: string;
	scope: string;
	artifacts: string[];
	acceptanceCriteria: string[];
	dependsOn: string[];
	estimateDays: number;
	gapRefs: string[];
}

/** Parity criteria are mandatory for any Frontend or API task with a legacy counterpart, never optional model output. */
function withParityCriteria(layer: Layer, legacyReference: string | null, base: readonly string[]): string[] {
	const criteria = [...base];
	if (legacyReference && (layer === 'Frontend' || layer === 'API')) {
		criteria.push(`The legacy file(s) under "${legacyReference}" were opened and read before writing the replacement.`);
		criteria.push(layer === 'Frontend' ? 'HTML and UI structure matches legacy: same element types and layout shape.' : "Response shape (keys, envelope, status codes) is compatible with the legacy endpoint's output.");
	}
	return criteria;
}

const LAYER_TEMPLATES: readonly { layer: 'Frontend' | 'API' | 'Data' | 'Documentation'; titleSuffix: string }[] = [
	{ layer: 'API', titleSuffix: 'route/endpoint' },
	{ layer: 'Data', titleSuffix: 'data-access layer' },
	{ layer: 'Frontend', titleSuffix: 'page/component' },
	{ layer: 'Documentation', titleSuffix: 'ADR for any deliberate divergence' }
];

/** The deterministic fallback: one task per layer. An ADR task only makes sense when there is legacy behavior to diverge from. */
export function buildTasks(storyTitle: string, legacyRef: string | null): TaskRecord[] {
	const templates = legacyRef ? LAYER_TEMPLATES : LAYER_TEMPLATES.filter(t => t.layer !== 'Documentation');
	return templates.map((template, index) => {
		const legacyReference = legacyRef && template.layer !== 'Documentation' ? legacyRef : null;
		return {
			taskId: `T-${index + 1}`,
			layerGroup: LAYER_GROUP[template.layer],
			layer: template.layer,
			title: `${storyTitle}: ${template.titleSuffix}`,
			scope: `Deliver the ${template.titleSuffix} for "${storyTitle}".`,
			artifacts: [`target/${template.layer.toLowerCase()}/${slugify(storyTitle)}`],
			acceptanceCriteria: withParityCriteria(template.layer, legacyReference, [`${storyTitle} ${template.titleSuffix} implemented and functioning.`]),
			dependencies: index === 0 ? [] : [`T-${index}`],
			legacyReference,
			gapRefs: [],
			estimateDays: template.layer === 'Documentation' ? 0.5 : 1
		};
	});
}

/**
 * Claude's task list for one story. Claude chooses the tasks and layers; code enforces what must not depend on model
 * output: valid gap ids only, a legacy reference only from the story's own path, parity criteria, and dependencies
 * that point only at earlier tasks.
 */
export async function buildTasksWithClaude(story: StoryRecord, gaps: readonly GapRef[], options: CallOptions): Promise<TaskRecord[]> {
	const legacyLine = story.legacyRef ? `Legacy source path (read-only reference for parity): ${story.legacyRef}` : 'No legacy counterpart: this is a net-new capability.';
	const prompt = `You are breaking ONE user story of a parallel-build migration into implementation tasks. The legacy application is read-only: no task may modify it.

## Binding constraints
- No task's scope or acceptance criteria may require writing to the legacy application. Legacy paths appear only as things to READ for behavioral parity.

## Story ${story.storyId}
Title: "${story.title}"
Persona: ${story.persona}
Goal: ${story.goal}
Benefit: ${story.benefit}
Scope: ${JSON.stringify(story.scope)}
Acceptance criteria: ${JSON.stringify(story.acceptanceCriteria)}
${legacyLine}

## Gap catalog (traceability: tag only IDs that appear here)
${gaps.length ? gaps.map(g => `${g.gapId} | ${g.category} | ${g.title}`).join('\n') : '(no gap analysis available: use an empty gapRefs array)'}

## Instructions
Write the COMPLETE ordered task list needed to deliver the story and satisfy EVERY one of its acceptance criteria. You decide the tasks; typically 3 to 7, each completable in 0.5 to 3 days.
- layer must be one of: ${LAYERS.join(', ')}. Cover data, API, UI, jobs and infrastructure, error handling and testing work where the story needs it; add a Documentation (ADR) task only when the story deliberately diverges from legacy behavior.
- scope: one concrete sentence naming the file pattern, route or component involved (not generic).
- artifacts: the target file paths to create or modify.
- dependsOn: titles of EARLIER tasks only; foundations (data, shared pieces) come first.
- gapRefs: every gap ID from the catalog whose description overlaps THIS task's scope (same capability, legacy component or route, or explicit parity concern); [] if none genuinely apply. Do not invent IDs.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
	const result = await runClaudeSynthesis<{ tasks: TaskDraft[] }>({ prompt, jsonSchema: TASKS_SCHEMA, ...options });
	const drafts = (result.tasks ?? []).filter(t => t.title?.trim() && LAYERS.includes(t.layer));
	if (drafts.length === 0) {
		throw new Error('Claude returned no tasks.');
	}
	const validGapIds = new Set(gaps.map(g => g.gapId));
	const indexByTitle = new Map(drafts.map((d, i) => [d.title.trim().toLowerCase(), i + 1]));
	return drafts.map((d, i) => {
		// Never invented: the story's own legacy path, and never for a Documentation task.
		const legacyReference = story.legacyRef && d.layer !== 'Documentation' ? story.legacyRef : null;
		return {
			taskId: `T-${i + 1}`,
			layerGroup: LAYER_GROUP[d.layer],
			layer: d.layer,
			title: d.title.trim(),
			scope: d.scope,
			artifacts: d.artifacts.length ? d.artifacts : [`target/${d.layer.toLowerCase()}/${slugify(story.title)}`],
			acceptanceCriteria: withParityCriteria(d.layer, legacyReference, d.acceptanceCriteria),
			dependencies: [...new Set(d.dependsOn.map(title => indexByTitle.get(title.trim().toLowerCase())).filter((n): n is number => !!n && n < i + 1).map(n => `T-${n}`))],
			legacyReference,
			gapRefs: [...new Set((d.gapRefs ?? []).filter(id => validGapIds.has(id)))],
			estimateDays: Number.isFinite(d.estimateDays) && d.estimateDays > 0 ? d.estimateDays : 1
		};
	});
}

const REVIEW_SCHEMA = (categories: readonly string[]) => strictObject({
	verdict: { type: 'string', enum: ['Approved', 'ApprovedWithMinorRevisions', 'NeedsRevision'] },
	findings: {
		type: 'array',
		items: strictObject({
			category: { type: 'string', enum: [...categories] },
			severity: { type: 'string', enum: ['Critical', 'Major', 'Minor'] },
			itemId: { type: ['string', 'null'] },
			summary: { type: 'string' }
		})
	}
});

const VERDICT_RULES = `Return verdict:
- "Approved" if no Critical or Major findings.
- "ApprovedWithMinorRevisions" if only Minor findings.
- "NeedsRevision" if any Critical or Major finding exists.

For each finding: category, severity, itemId it applies to (or null if it is about the set as a whole, such as a missing item), summary (one sentence, specific).

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;

/** An independent read-only review of a milestone's stories: a separate call from the one that wrote them, on purpose. */
export function reviewStoriesWithClaude(milestone: { milestoneId: string; name: string; description: string; unitRefs: string[] }, stories: readonly StoryRecord[], definitionOfDone: readonly string[] | undefined, options: CallOptions): Promise<StoryReviewResult> {
	const prompt = `You are an independent, read-only reviewer of user stories generated for a migration milestone. You did NOT write these stories. Your job is to find real gaps, not rubber-stamp them.

## Milestone
${JSON.stringify(milestone, undefined, 2)}

## Generated Stories
${JSON.stringify(stories.map(s => ({ storyId: s.storyId, title: s.title, persona: s.persona, goal: s.goal, benefit: s.benefit, acceptanceCriteria: s.acceptanceCriteria, dependencies: s.dependencies })), undefined, 2)}

## Milestone definition of done (from the deep analysis, may be absent)
${definitionOfDone?.length ? JSON.stringify(definitionOfDone, undefined, 2) : '(not available)'}

## Check
1. Coverage: does every target in unitRefs have at least one story? Flag any target with zero story coverage (category "coverage"). When a definition of done is provided, also flag any item that no story's acceptance criteria would satisfy (category "coverage", itemId null).
2. Quality: is each story's acceptance criteria specific and observable, not vague ("works correctly", "is implemented")? Flag vague criteria (category "quality").
3. Gaps: are personas plausible for this milestone, and do dependencies make sense (no story depending on a later one)? Flag anything ungrounded or nonsensical (category "gap"). Also flag circular dependencies and stories that are too large to finish in a few days or that mix unrelated work (category "quality").

${VERDICT_RULES}`;
	return runClaudeSynthesis<StoryReviewResult>({ prompt, jsonSchema: REVIEW_SCHEMA(['gap', 'quality', 'coverage']), ...options });
}

/** An independent read-only review of one story's tasks. */
export function reviewTasksWithClaude(story: StoryRecord, tasks: readonly TaskRecord[], options: CallOptions): Promise<StoryReviewResult> {
	const prompt = `You are an independent, read-only reviewer of implementation tasks generated for a user story. You did NOT write these tasks. Your job is to find real gaps, not rubber-stamp them.

## Story
${JSON.stringify({ storyId: story.storyId, title: story.title, scope: story.scope, acceptanceCriteria: story.acceptanceCriteria }, undefined, 2)}

## Generated Tasks
${JSON.stringify(tasks.map(t => ({ taskId: t.taskId, layer: t.layer, title: t.title, scope: t.scope, acceptanceCriteria: t.acceptanceCriteria, legacyReference: t.legacyReference, dependencies: t.dependencies })), undefined, 2)}

## Check
1. Coverage: do the tasks collectively cover the story's scope and acceptance criteria? Flag anything in the story's scope with no corresponding task (category "gap").
2. Sequencing: do any dependencies point at a LATER task, or form a cycle? Flag any such ordering problem (category "sequencing").
3. Quality: for any task with a non-null legacyReference and layer "Frontend" or "API", do its acceptance criteria include a parity check (the legacy file was read, or structure or response shape matches)? Flag a Frontend or API task with a legacyReference but no parity criterion (category "quality"). Also flag a set with no testing or error-handling work where the story clearly needs it (category "gap"), and a "Documentation" task that exists although no task in the set has a legacyReference (an ADR task implies legacy behavior to diverge from).

${VERDICT_RULES}`;
	return runClaudeSynthesis<StoryReviewResult>({ prompt, jsonSchema: REVIEW_SCHEMA(['gap', 'sequencing', 'quality']), ...options });
}

function reviewSection(findings: readonly ReviewFinding[] | null): string[] {
	if (!findings) {
		return [];
	}
	return ['## Review Findings', '', ...(findings.length === 0 ? ['No issues found.'] : findings.map(f => `- [${f.severity}] (${f.category}) ${f.summary}`)), ''];
}

/** `migration/user-stories/<milestone>/index.md`. */
export function buildStoryIndexMarkdown(milestoneId: string, stories: readonly StoryRecord[], findings: readonly ReviewFinding[] | null): string {
	const lines = [`# User Stories: ${milestoneId}`, '', '| ID | Title | Persona | Effort | Depends On |', '|---|---|---|---|---|'];
	lines.push(...stories.map(s => `| ${s.storyId} | ${s.title} | ${s.persona} | ${s.effort} | ${s.dependencies.join(', ') || 'None'} |`), '', ...reviewSection(findings));
	return lines.join('\n');
}

/** One story file. */
export function buildStoryMarkdown(s: StoryRecord, findings: readonly ReviewFinding[] | null): string {
	const lines = [`# ${s.storyId}: ${s.title}`, '', `> As a ${s.persona}, I want ${s.goal}, so that ${s.benefit}.`, '', '## Scope', '', ...s.scope.map(x => `- ${x}`), '', '## Out of Scope', '', ...s.outOfScope.map(x => `- ${x}`), '', '## Acceptance Criteria', '', ...s.acceptanceCriteria.map(x => `- [ ] ${x}`), '', `**Effort:** ${s.effort}`, ''];
	lines.push(...reviewSection(findings));
	return lines.join('\n');
}

/** `migration/tasks/<milestone>/<story>/index.md`. */
export function buildTaskIndexMarkdown(storyId: string, storyTitle: string, tasks: readonly TaskRecord[], findings: readonly ReviewFinding[] | null): string {
	const lines = [`# ${storyTitle}: Task Index`, '', `> Story: ${storyId}`, '', '| ID | LG | Title | Estimate (d) | Depends On |', '|---|---|---|---|---|'];
	lines.push(...tasks.map(t => `| ${t.taskId} | ${t.layerGroup} | ${t.title} | ${t.estimateDays} | ${t.dependencies.join(', ') || 'None'} |`), '', ...reviewSection(findings));
	return lines.join('\n');
}

/** One task file. */
export function buildTaskMarkdown(t: TaskRecord, storyId: string, findings: readonly ReviewFinding[] | null): string {
	const lines = [`# ${t.taskId}: ${t.title}`, '', `> Story: ${storyId} | Layer: ${t.layer} (${t.layerGroup})`, '', '## Scope', '', t.scope, '', '## Artifacts to create or modify', '', ...t.artifacts.map(a => `- \`${a}\``), '', '## Acceptance Criteria', '', ...t.acceptanceCriteria.map(x => `- [ ] ${x}`), ''];
	if (t.legacyReference) {
		lines.push(`**Legacy reference:** \`${t.legacyReference}\` (read-only)`, '');
	}
	lines.push('## Gap References', '', ...(t.gapRefs.length ? t.gapRefs.map(g => `- ${g}`) : ['No related gaps identified.']), '', `**Estimate:** ${t.estimateDays}d`, '', ...reviewSection(findings));
	return lines.join('\n');
}

import type { Project } from '@/features/migration/types';
import { ClaudeCliCancelledError } from './claudeCli';
import { connectDB } from './db';
import { resolveLegacyRefByTarget } from './legacyRefs';
import type { MilestoneDoc } from './models/Milestone';
import { ScopeCharter } from './models/ScopeCharter';
import { StoryPlan } from './models/StoryPlan';
import { SubProjectAnalysis } from './models/SubProjectAnalysis';
import { TargetMapping } from './models/TargetMapping';
import { requireDependencyContext } from './planningContext';
import { removeProjectPath, slugify, writeProjectFile } from './projectWorkspace';
import type { RunContext } from './runner';
import {
	buildStories, buildStoriesWithClaude, buildStoryIndexMarkdown, buildStoryMarkdown, buildTaskIndexMarkdown, buildTaskMarkdown, buildTasks, buildTasksWithClaude,
	reviewStoriesWithClaude, reviewTasksWithClaude,
	type GapRef, type MilestoneStoryContext, type ReviewFinding, type StoryReviewResult, type StoryWithTasks
} from './stories';

const MAX_GAPS_IN_PROMPT = 150;

/** The name the reviewer sees for a milestone. */
export function milestoneName(milestone: Pick<MilestoneDoc, 'name' | 'renamedTo'>): string {
	return milestone.renamedTo ?? milestone.name;
}

/** Everything the story prompts need for one milestone, read from the earlier steps. */
export async function loadStoryContext(project: Project, milestone: MilestoneDoc): Promise<MilestoneStoryContext> {
	await connectDB();
	const [context, analyses, legacyRefByTarget, scope, mapping] = await Promise.all([
		requireDependencyContext(project.id),
		SubProjectAnalysis.find({ projectId: project.id }).sort({ subProjectPath: 1 }).lean(),
		resolveLegacyRefByTarget(project.id),
		ScopeCharter.findOne({ projectId: project.id }).lean(),
		TargetMapping.findOne({ projectId: project.id }).lean()
	]);
	const targets = milestone.unitRefs.map(name => {
		const unit = context.units.find(u => u.name === name);
		if (unit) {
			return { name, type: 'migration-unit', domain: unit.domain, scope: unit.scopeEstimate, capabilities: unit.capabilities.map(c => c.name), dependsOn: unit.upstreamDependencies.map(d => d.name), blockers: unit.migrationBlockers.map(b => b.blocker) };
		}
		const service = context.sharedServices.find(s => s.name === name);
		return { name, type: 'shared-service', blockers: service?.migrationBlockers.map(b => b.blocker) ?? [] };
	});
	return {
		milestone: { milestoneId: milestone.milestoneId, name: milestoneName(milestone), description: milestone.description, unitRefs: milestone.unitRefs, deepAnalysis: milestone.deepAnalysis },
		targets,
		analyses: analyses.map(a => ({ subProjectPath: a.subProjectPath, technicalDebt: a.dimensions.modernization.technicalDebt, personas: a.dimensions.users.personas })),
		legacyRefByTarget,
		gaps: (scope?.gaps ?? []).slice(0, MAX_GAPS_IN_PROMPT).map(g => ({ gapId: g.gapId, title: g.title, category: g.category })),
		mappings: (mapping?.entries ?? []).filter(e => mapping?.approved.includes(e.category)).map(e => ({ category: e.category, legacyPattern: e.legacyPattern, targetPattern: e.targetPattern }))
	};
}

/** Runs a best-effort Claude step: a Stop propagates, any other failure is logged and reported as `undefined`. */
async function attempt<T>(run: RunContext, work: () => Promise<T>, failure: string, progress?: number): Promise<T | undefined> {
	try {
		return await work();
	} catch (error) {
		if (run.signal.aborted || error instanceof ClaudeCliCancelledError) {
			throw error;
		}
		await run.log('warning', failure, progress);
		return undefined;
	}
}

function findingsFor(review: StoryReviewResult | null, itemId: string): ReviewFinding[] | null {
	return review ? review.findings.filter(f => f.itemId === itemId) : null;
}

function crossFindings(review: StoryReviewResult | null): ReviewFinding[] | null {
	return review ? review.findings.filter(f => !f.itemId) : null;
}

/** Writes one story's task files (the story's own folder is replaced). */
async function writeTaskFiles(project: Project, milestoneId: string, story: StoryWithTasks): Promise<void> {
	const folder = `migration/tasks/${milestoneId}/${slugify(story.storyId)}`;
	await removeProjectPath(project.dest, folder);
	await writeProjectFile(project.dest, `${folder}/index.md`, buildTaskIndexMarkdown(story.storyId, story.title, story.tasks, crossFindings(story.taskReview)));
	for (const task of story.tasks) {
		await writeProjectFile(project.dest, `${folder}/${slugify(task.taskId)}-${slugify(task.title)}.md`, buildTaskMarkdown(task, story.storyId, findingsFor(story.taskReview, task.taskId)));
	}
}

/** Writes a milestone's story files (the milestone's own folder is replaced) and every story's task files. */
async function writeMilestoneFiles(project: Project, milestoneId: string, stories: readonly StoryWithTasks[], review: StoryReviewResult | null): Promise<void> {
	const folder = `migration/user-stories/${milestoneId}`;
	await removeProjectPath(project.dest, folder);
	await writeProjectFile(project.dest, `${folder}/index.md`, buildStoryIndexMarkdown(milestoneId, stories, crossFindings(review)));
	for (const story of stories) {
		await writeProjectFile(project.dest, `${folder}/${slugify(story.storyId)}-${slugify(story.title)}.md`, buildStoryMarkdown(story, findingsFor(review, story.storyId)));
		await writeTaskFiles(project, milestoneId, story);
	}
}

/** Writes the tasks of one story and the independent review of them. Claude first; the layer template when its draft fails. */
async function writeTasksFor(run: RunContext, story: StoryWithTasks, gaps: readonly GapRef[], progress: number): Promise<StoryWithTasks> {
	const call = { signal: run.signal, onProcessStart: run.onProcessStart };
	let tasks = await attempt(run, () => buildTasksWithClaude(story, gaps, call), `Claude's tasks for ${story.storyId} failed; the layer template was used instead.`, progress);
	const source = tasks ? 'claude' : 'deterministic';
	tasks ??= buildTasks(story.title, story.legacyRef);
	const written = tasks;
	const taskReview = source === 'claude' ? await attempt(run, () => reviewTasksWithClaude(story, written, call), `The task review for ${story.storyId} failed; there is no review for it.`, progress) ?? null : null;
	return { ...story, tasks: written, taskSource: source, taskReview };
}

/**
 * Writes a milestone's stories, the independent review of them, and the tasks and review of each story, then stores
 * and writes them. `progress(fraction)` maps the fraction of this milestone to the run's progress.
 */
export async function generateMilestoneStories(run: RunContext, project: Project, milestone: MilestoneDoc, progress: (fraction: number) => number): Promise<StoryWithTasks[]> {
	const context = await loadStoryContext(project, milestone);
	const call = { signal: run.signal, onProcessStart: run.onProcessStart };
	const name = milestoneName(milestone);
	await run.log('plan', `Writing the stories for ${milestone.milestoneId}: ${name}.`, progress(0));
	let drafts = await attempt(run, () => buildStoriesWithClaude(context, call), `Claude's stories for ${milestone.milestoneId} failed; one story per target was used instead.`, progress(0.1));
	const storySource = drafts ? 'claude' : 'deterministic';
	drafts ??= buildStories(milestone.milestoneId, milestone.unitRefs, context.analyses, context.legacyRefByTarget);
	const written = drafts;
	const definitionOfDone = (milestone.deepAnalysis?.definitionOfDone as string[] | undefined);
	const storyReview = storySource === 'claude'
		? await attempt(run, () => reviewStoriesWithClaude({ milestoneId: milestone.milestoneId, name, description: milestone.description, unitRefs: milestone.unitRefs }, written, definitionOfDone, call), `The story review for ${milestone.milestoneId} failed; there is no review for it.`, progress(0.2)) ?? null
		: null;
	await run.log('progress', `${written.length} stories drafted for ${milestone.milestoneId}.`, progress(0.2));
	const stories: StoryWithTasks[] = [];
	for (const [index, draft] of written.entries()) {
		stories.push(await writeTasksFor(run, { ...draft, tasks: [], taskSource: 'deterministic', taskReview: null }, context.gaps, progress(0.2 + 0.8 * (index / written.length))));
		await run.log('progress', `Tasks written for ${draft.storyId}.`, progress(0.2 + 0.8 * ((index + 1) / written.length)));
	}
	await StoryPlan.deleteOne({ projectId: project.id, milestoneId: milestone.milestoneId });
	await StoryPlan.create({ projectId: project.id, milestoneId: milestone.milestoneId, stories, storyReview, storySource, runId: run.runId });
	await writeMilestoneFiles(project, milestone.milestoneId, stories, storyReview);
	return stories;
}

/** Rewrites the tasks of one story of a stored plan, keeping its other stories. Returns `false` when the story is not in the plan. */
export async function regenerateStoryTasks(run: RunContext, project: Project, milestone: MilestoneDoc, storyId: string): Promise<boolean> {
	const plan = await StoryPlan.findOne({ projectId: project.id, milestoneId: milestone.milestoneId });
	const index = plan?.stories.findIndex(s => s.storyId === storyId) ?? -1;
	if (!plan || index < 0) {
		return false;
	}
	const context = await loadStoryContext(project, milestone);
	await run.log('plan', `Rewriting the tasks of ${storyId}.`, 0.1);
	const updated = await writeTasksFor(run, plan.stories[index], context.gaps, 0.2);
	plan.stories[index] = updated;
	plan.markModified('stories');
	plan.runId = run.runId;
	await plan.save();
	await writeTaskFiles(project, milestone.milestoneId, updated);
	await run.log('progress', `Tasks rewritten for ${storyId}.`, 1);
	return true;
}

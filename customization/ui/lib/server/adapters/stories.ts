import type { AnalyzeTask } from '@/features/migration/analyze';
import type { StoriesResult, Story } from '@/features/migration/stories';
import type { StoryPlanDoc } from '../models/StoryPlan';
import type { LastRunInfo } from './runInfo';

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Writing user stories per milestone', description: 'Acceptance criteria included' },
	{ label: 'Splitting stories into tasks', description: 'Atomic tasks with ordering constraints' },
	{ label: 'Reviewing stories and tasks', description: 'An independent pass for gaps and sequencing' },
	{ label: 'Writing the story and task files', description: 'Story and task files for the destination repo' }
];

/** Before any run: the task list with no stories, so the running screen has something to progress against. */
export function emptyStories(): StoriesResult {
	return { tasks: TASKS.map(task => ({ ...task, doneMeta: '' })), logs: [], stories: [], duration: '' };
}

/**
 * Maps the stored plans to what the Stories step shows, in milestone order. Derivations: the story text is the
 * "As a persona, I want goal, so that benefit" sentence; `size` is the story's effort; `criteria` are its acceptance
 * criteria (the do-not-carry-forward line stays last); `tasks` are the task titles.
 */
export function adaptStories(plans: readonly StoryPlanDoc[], run: LastRunInfo): StoriesResult {
	const stories: Story[] = [...plans].sort((a, b) => a.milestoneId.localeCompare(b.milestoneId)).flatMap(plan => plan.stories.map(s => ({
		id: s.storyId,
		milestoneId: plan.milestoneId,
		title: s.title,
		size: s.effort,
		text: `As a ${s.persona}, I want ${s.goal}, so that ${s.benefit}.`,
		criteria: s.acceptanceCriteria,
		tasks: s.tasks.map(t => t.title)
	})));
	if (stories.length === 0) {
		return emptyStories();
	}
	const taskCount = stories.reduce((sum, s) => sum + s.tasks.length, 0);
	const reviews = plans.reduce((sum, p) => sum + (p.storyReview ? 1 : 0) + p.stories.filter(s => s.taskReview).length, 0);
	const meta = [`${stories.length} stories`, `${taskCount} tasks`, reviews === 0 ? 'No reviews' : `${reviews} reviews`, `${plans.length} milestone folders`];
	return { tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index], ...(index === 0 ? { total: stories.length } : index === 1 ? { total: taskCount } : {}) })), logs: run.logs, stories, duration: run.duration };
}

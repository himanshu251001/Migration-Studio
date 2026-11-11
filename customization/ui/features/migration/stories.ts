import type { AnalyzeTask } from './analyze';
import type { Milestone } from './milestones';

/** A user story with its acceptance criteria and implementation tasks. */
export interface Story {
	/** Unique within the result, e.g. "US-M-02-1". */
	readonly id: string;
	/** Id of the milestone the story belongs to. */
	readonly milestoneId: string;
	readonly title: string;
	/** T-shirt size: XS, S, M or L. */
	readonly size: string;
	readonly text: string;
	/** Acceptance criteria. The last one may be a "do not carry forward" note, shown as a warning. */
	readonly criteria: readonly string[];
	readonly tasks: readonly string[];
}

/** Everything the Stories step shows. */
export interface StoriesResult {
	readonly tasks: readonly AnalyzeTask[];
	readonly logs: readonly string[];
	readonly stories: readonly Story[];
	readonly duration: string;
}

/** A milestone with the stories written for it, as exported in the backlog. */
export interface BacklogMilestone extends Milestone {
	readonly stories: readonly Story[];
}

/** Renders the plan as the `MIGRATION-BACKLOG.md` handed to the team. */
export function toBacklogMarkdown(project: string, milestones: readonly BacklogMilestone[]): string {
	const lines = [`# Migration backlog: ${project}`, ''];
	for (const m of milestones) {
		lines.push(`## ${m.id}: ${m.name} (${m.size})`, '', `Covers ${m.covers}`, '');
		for (const s of m.stories) {
			lines.push(`### ${s.id}: ${s.title} (${s.size})`, '', s.text, '', '**Acceptance criteria**', '');
			lines.push(...s.criteria.map(c => `- [ ] ${c}`), '', '**Tasks**', '');
			lines.push(...s.tasks.map((t, i) => `${i + 1}. ${t}`), '');
		}
	}
	return lines.join('\n');
}

/** Totals shown in the summary. */
export function countBacklog(milestones: readonly BacklogMilestone[]): { stories: number; tasks: number } {
	const stories = milestones.flatMap(m => m.stories);
	return { stories: stories.length, tasks: stories.reduce((n, s) => n + s.tasks.length, 0) };
}

/** Renders the plan as JSON for tools that import a backlog. */
export function toBacklogJson(project: string, milestones: readonly BacklogMilestone[]): string {
	return JSON.stringify({ project, milestones }, undefined, 2);
}

function csvCell(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

/** Renders one row per task: milestone, story, size, task number and text. */
export function toBacklogCsv(milestones: readonly BacklogMilestone[]): string {
	const rows = [['milestone', 'story', 'title', 'size', 'task', 'text']];
	for (const m of milestones) {
		for (const s of m.stories) {
			s.tasks.forEach((t, i) => rows.push([m.id, s.id, s.title, s.size, String(i + 1), t]));
		}
	}
	return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

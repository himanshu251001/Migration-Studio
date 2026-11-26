import type { BacklogMilestone, Story } from './stories';

/** Issue trackers the plan can be pushed to. Only GitHub has an adapter so far. */
export type TrackerProvider = 'github' | 'linear' | 'jira';

export interface TrackerOption {
	readonly id: TrackerProvider;
	readonly label: string;
	readonly available: boolean;
	readonly targetLabel: string;
	readonly targetPlaceholder: string;
	/** Matches a valid target for this tracker. */
	readonly targetPattern: RegExp;
}

export const TRACKERS: readonly TrackerOption[] = [
	{ id: 'github', label: 'GitHub Issues', available: false, targetLabel: 'Repository', targetPlaceholder: 'Repository (owner/repo)', targetPattern: /^[\w.-]+\/[\w.-]+$/ },
	{ id: 'linear', label: 'Linear', available: false, targetLabel: 'Team key', targetPlaceholder: 'Team key (e.g. ENG)', targetPattern: /^[A-Za-z0-9]+$/ },
	{ id: 'jira', label: 'Jira', available: false, targetLabel: 'Project key', targetPlaceholder: 'Project key (e.g. MIG)', targetPattern: /^[A-Za-z][A-Za-z0-9_]+$/ }
];

/** Outcome of one tracker item. */
export interface CreatedItem {
	readonly id: string;
	readonly title: string;
	readonly url: string;
	/** True when an item with this marker already existed and was left alone. */
	readonly existing: boolean;
}

export interface PushFailure {
	readonly id: string;
	readonly message: string;
}

export interface TrackerPushResult {
	readonly milestones: readonly CreatedItem[];
	readonly stories: readonly CreatedItem[];
	readonly failures: readonly PushFailure[];
}

/** Hidden marker put in each created item so a retried push finds it instead of duplicating it. */
export function trackerMarker(itemId: string): string {
	return `<!-- migration-studio:${itemId} -->`;
}

/** Issue body for a story: description, acceptance criteria and a task checklist. */
export function storyIssueBody(story: Story): string {
	return [
		story.text, '',
		'**Acceptance criteria**', '',
		...story.criteria.map(c => `- [ ] ${c}`), '',
		'**Tasks**', '',
		...story.tasks.map(t => `- [ ] ${t}`), '',
		`Size: ${story.size}`, '',
		trackerMarker(story.id)
	].join('\n');
}

/** Milestone description. */
export function milestoneDescription(m: BacklogMilestone): string {
	return `Covers ${m.covers}\n\nSize: ${m.size}\n\n${trackerMarker(m.id)}`;
}

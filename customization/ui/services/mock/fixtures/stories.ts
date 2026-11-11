import type { Story, StoriesResult } from '@/features/migration/stories';

const TITLES: Record<string, readonly (readonly [string, string])[]> = {
	'M-01': [['Shared logging', 'XS']],
	'M-02': [['Token issuing', 'S'], ['Session migration', 'S']],
	'M-03': [['Product listing', 'S'], ['Search', 'XS']],
	'M-04': [['Cart', 'S'], ['Checkout', 'S']],
	'M-05': [['Order history', 'XS']]
};

function storiesFor(milestoneId: string): Story[] {
	return (TITLES[milestoneId] ?? []).map(([title, size], i) => ({
		id: `US-${milestoneId}-${i + 1}`,
		milestoneId,
		title,
		size,
		text: `As an internal service consumer, I want ${title.toLowerCase()} to work in the migrated target, so that I can rely on "${title}" without falling back to the legacy application.`,
		criteria: [
			`The "${title}" capability is available end-to-end in the target codebase.`,
			"Response and UI shape match the legacy sub-project's behavior for this capability.",
			'Do not carry forward: "No typed request validation on older routes". Fix it in the new implementation, not in the legacy code.'
		],
		tasks: [
			`Port the ${title.toLowerCase()} endpoint to the target stack`,
			'Add contract tests against legacy responses',
			'Wire the per-unit feature flag',
			'Remove the legacy route after a clean release cycle'
		]
	}));
}

/** Sample stories and tasks for the milestones in the milestones fixture. */
export const STORIES_FIXTURE: StoriesResult = {
	tasks: [
		{ label: 'Writing user stories per milestone', description: 'Acceptance criteria included', total: 8, doneMeta: '8 stories' },
		{ label: 'Splitting stories into tasks', description: 'Atomic tasks with ordering constraints', total: 32, doneMeta: '32 tasks' },
		{ label: 'Estimating and labelling', description: 'Size, unit and layer labels', doneMeta: 'All labelled' },
		{ label: 'Generating MIGRATION-BACKLOG.md', description: 'Backlog file for the destination repo', doneMeta: 'Backlog written' }
	],
	logs: [
		'[INFO] Loading milestones M-01 ... M-05',
		'[INFO] 8 user stories drafted',
		'[DEBUG] Split US-M-04-2 into 4 tasks',
		'[INFO] 32 tasks labelled by unit and layer',
		'[INFO] Wrote MIGRATION-BACKLOG.md'
	],
	stories: ['M-01', 'M-02', 'M-03', 'M-04', 'M-05'].flatMap(storiesFor),
	duration: '1m 02s'
};

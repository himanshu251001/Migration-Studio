import type { MilestonesResult } from '@/features/migration/milestones';

/** Sample milestone plan for the legacy "Customer Portal" codebase. */
export const MILESTONES_FIXTURE: MilestonesResult = {
	tasks: [
		{ label: 'Sequencing units into sprints', description: 'Respecting the dependency order', doneMeta: '5 sprints' },
		{ label: 'Estimating effort per unit', description: 'From task counts and complexity', doneMeta: '14 weeks' },
		{ label: 'Defining exit criteria', description: 'Parity, coverage and sign-off per milestone', doneMeta: '5 gates' }
	],
	logs: [
		'[INFO] Sequencing UNIT-01 ... UNIT-05 into sprints',
		'[DEBUG] UNIT-02 and UNIT-03 can run in parallel',
		'[INFO] Total estimate: 14 weeks',
		'[INFO] Exit criteria attached to each milestone'
	],
	milestones: [
		{ id: 'M-01', name: 'Foundation', size: 'S', covers: 'Shared Infrastructure.' },
		{ id: 'M-02', name: 'Authentication', size: 'M', covers: 'Authentication.' },
		{ id: 'M-03', name: 'Catalog', size: 'L', covers: 'Catalog.' },
		{ id: 'M-04', name: 'Cart & Checkout', size: 'L', covers: 'Cart & Checkout.' },
		{ id: 'M-05', name: 'Orders Portal', size: 'M', covers: 'Orders Portal.' }
	],
	analysisLogs: [
		'Simulating milestone deep analysis.',
		'Analysing current-state inventory for milestone "{name}".',
		'Reviewing the codebase · 4 checked',
		'Composing milestone deep-analysis report'
	],
	duration: '38s'
};

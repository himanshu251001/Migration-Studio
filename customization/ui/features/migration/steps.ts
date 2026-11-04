/** The ten workflow steps. Every step has a running screen and a done screen. */
export const STEP_DEFS = [
	{ slug: 'analyze', short: 'Analyze', label: 'Analyze the codebase' },
	{ slug: 'approach', short: 'Approach', label: 'Choose a migration approach' },
	{ slug: 'index', short: 'Index', label: 'Build the component index' },
	{ slug: 'units', short: 'Units', label: 'Group into migration units' },
	{ slug: 'dependencies', short: 'Dependencies', label: 'Find cross-unit dependencies' },
	{ slug: 'scope', short: 'Scope', label: 'Confirm scope, goals and outcomes' },
	{ slug: 'target', short: 'Target', label: 'Map to target technology' },
	{ slug: 'rollout', short: 'Rollout', label: 'Plan the rollout' },
	{ slug: 'milestones', short: 'Milestones', label: 'Set milestones' },
	{ slug: 'stories', short: 'Stories', label: 'Break down stories and tasks' }
] as const;

export type StepSlug = (typeof STEP_DEFS)[number]['slug'];
export type ScreenKey = 'ready' | StepSlug | `${StepSlug}-done`;
export type ScreenKind = 'ready' | 'running' | 'done';

export interface ScreenDef {
	readonly key: ScreenKey;
	readonly kind: ScreenKind;
	/** Index into STEP_DEFS, -1 before the first step. */
	readonly step: number;
}

/** Every screen in flow order: ready, then (running, done) for each step. */
export const SCREENS: readonly ScreenDef[] = [
	{ key: 'ready', kind: 'ready', step: -1 },
	...STEP_DEFS.flatMap((s, step): ScreenDef[] => [
		{ key: s.slug, kind: 'running', step },
		{ key: `${s.slug}-done`, kind: 'done', step }
	])
];

export function screenIndex(key: string): number {
	return SCREENS.findIndex(s => s.key === key);
}

export function isScreenKey(key: string): key is ScreenKey {
	return screenIndex(key) >= 0;
}

export function screenDef(key: ScreenKey): ScreenDef {
	return SCREENS[screenIndex(key)];
}

export function nextScreen(key: ScreenKey): ScreenKey | undefined {
	return SCREENS[screenIndex(key) + 1]?.key;
}

export function prevScreen(key: ScreenKey): ScreenKey | undefined {
	return SCREENS[screenIndex(key) - 1]?.key;
}

/** The screen a step opens on when navigated to: its done screen if reached, else its running screen. */
export function stepTarget(stepIndex: number, reached: number): ScreenKey | undefined {
	const slug = STEP_DEFS[stepIndex].slug;
	if (reached >= screenIndex(`${slug}-done`)) {
		return `${slug}-done`;
	}
	return reached >= screenIndex(slug) ? slug : undefined;
}

export type StepState = 'done' | 'active' | 'next' | 'locked';

/** State of a step relative to the screen currently shown. */
export function stepState(current: ScreenDef, stepIndex: number): StepState {
	if (current.step === -1) {
		return stepIndex === 0 ? 'next' : 'locked';
	}
	if (stepIndex < current.step) {
		return 'done';
	}
	if (stepIndex === current.step) {
		return current.kind === 'running' ? 'active' : 'done';
	}
	if (stepIndex === current.step + 1 && current.kind === 'done') {
		return 'next';
	}
	return 'locked';
}

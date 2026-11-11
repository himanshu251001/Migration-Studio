import type { ComponentType } from 'react';
import type { StepSlug } from '@/features/migration/steps';
import { AnalyzeStep } from './analyze';
import { ApproachStep } from './approach';
import { DependenciesStep } from './dependencies';
import { IndexStep } from './index-step';
import { MilestonesStep } from './milestones';
import { RolloutStep } from './rollout';
import { ScopeStep } from './scope';
import { StoriesStep } from './stories';
import { TargetStep } from './target';
import { UnitsStep } from './units';
import type { StepViewProps } from './types';

/** Built steps. A step without an entry shows the "not built yet" placeholder. Add a line per milestone. */
export const STEP_VIEWS: Partial<Record<StepSlug, ComponentType<StepViewProps>>> = {
	analyze: AnalyzeStep,
	approach: ApproachStep,
	index: IndexStep,
	units: UnitsStep,
	dependencies: DependenciesStep,
	scope: ScopeStep,
	target: TargetStep,
	rollout: RolloutStep,
	milestones: MilestonesStep,
	stories: StoriesStep
};

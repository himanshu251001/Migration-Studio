import type { TrackerProvider, TrackerPushResult } from '@/features/migration/tracker';
import type { AnalysisResult, ArtifactRef } from '@/features/migration/analyze';
import type { ApproachDecision, ApproachResult } from '@/features/migration/approach';
import type { IndexResult } from '@/features/migration/componentIndex';
import type { ReviewComment } from '@/features/migration/comments';
import type { Project, ProjectDraft } from '@/features/migration/types';
import type { DependenciesResult } from '@/features/migration/dependencies';
import type { MilestonesDecision, MilestonesResult } from '@/features/migration/milestones';
import type { BacklogMilestone, StoriesResult } from '@/features/migration/stories';
import type { RolloutDecision, RolloutResult } from '@/features/migration/rollout';
import type { ScopeDecision, ScopeResult } from '@/features/migration/scope';
import type { TargetDecision, TargetResult } from '@/features/migration/target';
import type { UnitsDecision, UnitsResult } from '@/features/migration/units';

/** Detects and creates migration projects. Replaced by a host/backend implementation later. */
export interface ProjectService {
	/** Migration projects found in the folders currently opened in the IDE. */
	detectProjects(folders: readonly string[]): Promise<readonly Project[]>;
	/** An empty draft for the Create New Project form. */
	createDraft(): Promise<ProjectDraft>;
	/** Creates a project in `folder` (one of the opened folders). */
	createProject(folder: string, draft: ProjectDraft): Promise<Project>;
}

/** Runs the migration pipeline. Step specific operations are added with each step. */
export interface MigrationService {
	/** Pre-flight and kick off the pipeline for `project`. */
	start(project: Project): Promise<void>;
	/** The analysis findings for `project`. */
	getAnalysis(project: Project): Promise<AnalysisResult>;
	/** Runs the analysis, taking the reviewer's `comments` on the previous result into account when re-running, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runAnalysis(project: Project, onProgress: (progress: number) => void, signal: AbortSignal, comments?: readonly ReviewComment[]): Promise<void>;
	/** The evaluated decomposition strategies for `project`. */
	getApproach(project: Project): Promise<ApproachResult>;
	/** Runs the strategy evaluation, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runApproach(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
	/** The strategy the reviewer locked, if any. */
	getApproachDecision(project: Project): Promise<ApproachDecision | undefined>;
	/** Locks the reviewer's strategy; later steps build on it. */
	lockApproach(project: Project, decision: ApproachDecision): Promise<void>;
	/** Forgets a locked strategy, used when the evaluation is re-run. */
	clearApproachDecision(project: Project): Promise<void>;
	/** The component index for `project`. */
	getIndex(project: Project): Promise<IndexResult>;
	/** Builds the component index, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runIndex(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
	/** Ids of the capabilities whose deep analysis has been generated. */
	getAnalyzedCapabilities(project: Project): Promise<readonly string[]>;
	/** Generates the deep analysis of one capability and records it. */
	analyzeCapability(project: Project, capabilityId: string): Promise<void>;
	/** Forgets generated deep analyses, used when the index is rebuilt. */
	clearAnalyzedCapabilities(project: Project): Promise<void>;
	/** The migration units for `project`, in the planner's order. */
	getUnits(project: Project): Promise<UnitsResult>;
	/** Groups components into units, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runUnits(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
	/** The reviewer's unit order and lock, if any. */
	getUnitsDecision(project: Project): Promise<UnitsDecision | undefined>;
	/** Saves the reviewer's unit order and lock; later steps build on a locked catalog. */
	saveUnitsDecision(project: Project, decision: UnitsDecision): Promise<void>;
	/** Forgets the saved order and lock, used when the units are regrouped. */
	clearUnitsDecision(project: Project): Promise<void>;
	/** The cross-unit dependencies for `project`. */
	getDependencies(project: Project): Promise<DependenciesResult>;
	/** Traces dependencies between units, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runDependencies(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
	/** The scope, goals, target stack candidates and gaps for `project`. */
	getScope(project: Project): Promise<ScopeResult>;
	/** Drafts the scope, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runScope(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
	/** The reviewer's scope choices, if any. */
	getScopeDecision(project: Project): Promise<ScopeDecision | undefined>;
	/** Saves the reviewer's scope choices; later steps build on a locked decision. */
	saveScopeDecision(project: Project, decision: ScopeDecision): Promise<void>;
	/** Forgets the saved choices, used when the scope is revised. */
	clearScopeDecision(project: Project): Promise<void>;
	/** The source-to-target technology mappings for `project`. */
	getTarget(project: Project): Promise<TargetResult>;
	/** Maps source technologies to the target, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runTarget(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
	/** The mappings the reviewer approved, if any. */
	getTargetDecision(project: Project): Promise<TargetDecision | undefined>;
	/** Saves the approved mappings; later steps build on a fully approved set. */
	saveTargetDecision(project: Project, decision: TargetDecision): Promise<void>;
	/** Forgets the approvals, used when the technology is re-mapped. */
	clearTargetDecision(project: Project): Promise<void>;
	/** The rollout strategy for `project`. */
	getRollout(project: Project): Promise<RolloutResult>;
	/** Plans the rollout, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runRollout(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
	/** The reviewer's sign-off on the strategy, if any. */
	getRolloutDecision(project: Project): Promise<RolloutDecision | undefined>;
	/** Saves the sign-off; later steps build on a locked strategy. */
	saveRolloutDecision(project: Project, decision: RolloutDecision): Promise<void>;
	/** Forgets the sign-off, used when the rollout is re-planned. */
	clearRolloutDecision(project: Project): Promise<void>;
	/** The drafted milestone plan for `project`. */
	getMilestones(project: Project): Promise<MilestonesResult>;
	/** Schedules the milestones, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runMilestones(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
	/** Runs the optional deep analysis of one milestone. Rejects with an `AbortError` when `signal` aborts. */
	analyzeMilestone(project: Project, milestoneId: string, signal: AbortSignal): Promise<void>;
	/** The reviewer's renames and sign-off, if any. */
	getMilestonesDecision(project: Project): Promise<MilestonesDecision | undefined>;
	/** Saves the renames and sign-off; later steps build on a locked plan. */
	saveMilestonesDecision(project: Project, decision: MilestonesDecision): Promise<void>;
	/** Forgets the renames and sign-off, used when the milestones are re-planned. */
	clearMilestonesDecision(project: Project): Promise<void>;
	/** The user stories and tasks for `project`'s milestones. */
	getStories(project: Project): Promise<StoriesResult>;
	/** Writes the stories and tasks, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runStories(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
	/** Re-runs the stories and tasks pipeline for one milestone, or only the tasks of one story. Rejects with an `AbortError` when `signal` aborts. */
	regenerateStories(project: Project, milestoneId: string, storyId: string | undefined, signal: AbortSignal): Promise<void>;
}

/** Writes generated artifacts to disk so the IDE can open and comment on them as ordinary files. */
export interface ArtifactService {
	/** Writes `artifact` under the project's artifact folder and returns its absolute path. */
	materialize(project: Project, artifact: ArtifactRef): Promise<string>;
	/** Comments the reviewer left on the project's artifacts that were not yet sent with a re-run. */
	getComments(project: Project): Promise<readonly ReviewComment[]>;
	/** Marks comments as sent with a re-run so they are not offered again. */
	markCommentsSent(project: Project, ids: readonly string[]): Promise<void>;
	/** Writes the finished plan to `<dest>/migration/<file>` for hand-over and returns its absolute path. */
	exportPlan(dest: string, file: string, content: string): Promise<string>;
}

/** Pushes the finished plan to an issue tracker. */
export interface TrackerService {
	/** Creates the milestones and stories in the tracker. `token` is sent with this request only and never stored. */
	push(request: { provider: TrackerProvider; target: string; token: string; plan: readonly BacklogMilestone[] }, signal: AbortSignal): Promise<TrackerPushResult>;
}

export interface Services {
	readonly projects: ProjectService;
	readonly migration: MigrationService;
	readonly artifacts: ArtifactService;
	readonly tracker: TrackerService;
}

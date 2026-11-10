import type { AnalysisResult, ArtifactRef } from '@/features/migration/analyze';
import type { ApproachDecision, ApproachResult } from '@/features/migration/approach';
import type { ReviewComment } from '@/features/migration/comments';
import type { Project, ProjectDraft } from '@/features/migration/types';

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
}

/** Writes generated artifacts to disk so the IDE can open and comment on them as ordinary files. */
export interface ArtifactService {
	/** Writes `artifact` under the project's artifact folder and returns its absolute path. */
	materialize(project: Project, artifact: ArtifactRef): Promise<string>;
	/** Comments the reviewer left on the project's artifacts that were not yet sent with a re-run. */
	getComments(project: Project): Promise<readonly ReviewComment[]>;
	/** Marks comments as sent with a re-run so they are not offered again. */
	markCommentsSent(project: Project, ids: readonly string[]): Promise<void>;
}

export interface Services {
	readonly projects: ProjectService;
	readonly migration: MigrationService;
	readonly artifacts: ArtifactService;
}

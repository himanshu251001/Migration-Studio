import type { AnalysisResult } from '@/features/migration/analyze';
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
	/** Runs the analysis, reporting progress from 0 to 1. Rejects with an `AbortError` when `signal` aborts. */
	runAnalysis(project: Project, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
}

export interface Services {
	readonly projects: ProjectService;
	readonly migration: MigrationService;
}

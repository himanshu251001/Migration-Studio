'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReviewComment } from '@/features/migration/comments';
import { SCREENS, screenIndex, type ScreenKey } from '@/features/migration/steps';
import type { Project } from '@/features/migration/types';
import { useNavigate } from './useNavigate';

const STORAGE_KEY = 'migration-studio-state-v2';
const LEGACY_STORAGE_KEY = 'migration-studio-state-v1';

type ReachedByProject = Readonly<Record<string, number>>;

interface Persisted {
	readonly project: Project | undefined;
	/** Per project: index (into SCREENS) of the furthest screen reached; later steps stay locked in the stepper. */
	readonly reachedByProject: ReachedByProject;
}

interface State extends Persisted {
	readonly hydrated: boolean;
}

type Action =
	| { type: 'hydrate'; state: Persisted }
	| { type: 'setProject'; project: Project }
	| { type: 'reach'; index: number }
	| { type: 'rerun'; index: number }
	| { type: 'reset' };

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case 'hydrate': return { ...action.state, hydrated: true };
		case 'setProject': return { ...state, project: action.project };
		case 'reach': {
			if (!state.project) {
				return state;
			}
			const id = state.project.id;
			return { ...state, reachedByProject: { ...state.reachedByProject, [id]: Math.max(state.reachedByProject[id] ?? 0, action.index) } };
		}
		// Re-running a step invalidates the steps after it (the backend clears them too): progress falls back to that step.
		case 'rerun': {
			if (!state.project) {
				return state;
			}
			return { ...state, reachedByProject: { ...state.reachedByProject, [state.project.id]: action.index } };
		}
		// forgets the active project only; each project keeps its own progress
		case 'reset': return { ...state, hydrated: true, project: undefined };
	}
}

function load(): Persisted {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<Persisted>;
			return { project: parsed.project, reachedByProject: parsed.reachedByProject ?? {} };
		}
		const legacy = sessionStorage.getItem(LEGACY_STORAGE_KEY);
		if (legacy) {
			const parsed = JSON.parse(legacy) as { project?: Project; reached?: number };
			return {
				project: parsed.project,
				reachedByProject: parsed.project && typeof parsed.reached === 'number' ? { [parsed.project.id]: parsed.reached } : {},
			};
		}
	} catch {
		// storage unavailable or corrupt: start fresh
	}
	return { project: undefined, reachedByProject: {} };
}

function save(state: Persisted): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ project: state.project, reachedByProject: state.reachedByProject }));
	} catch {
		// not persisted
	}
}

interface MigrationContextValue extends State {
	/** Index (into SCREENS) of the furthest screen reached in the active project. */
	readonly reached: number;
	/** The screen to resume the given project on: its furthest reached one, `ready` for a new project. */
	resumeScreen(project: Project): ScreenKey;
	/** Makes `project` the active one without navigating (e.g. a single detected project). */
	selectProject(project: Project): void;
	/** Makes `project` active and opens the studio's first screen. */
	openProject(project: Project): void;
	/** Forgets the active project and progress without navigating. */
	clear(): void;
	/** Navigates to a screen and records it as reached. */
	go(key: ScreenKey): void;
	/** Leaves the studio and clears progress. */
	exit(): void;
	/** Reviewer comments the next run of the analyze step is re-run with. Empty for a plain run. */
	analyzeRerunComments: readonly ReviewComment[];
	/** Sets the comments for the next analyze run (pass `[]` to clear). */
	setAnalyzeRerunComments(comments: readonly ReviewComment[]): void;
}

const MigrationContext = createContext<MigrationContextValue | undefined>(undefined);

/** Project and progress state for the migration flow. Progress is kept per project in localStorage; host-owned state is a later phase. */
export function MigrationProvider({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate();
	const [state, dispatch] = useReducer(reducer, { hydrated: false, project: undefined, reachedByProject: {} });
	const progressRef = useRef<ReachedByProject>({});
	progressRef.current = state.reachedByProject;
	const [analyzeRerunComments, setAnalyzeRerunComments] = useState<readonly ReviewComment[]>([]);

	useEffect(() => dispatch({ type: 'hydrate', state: load() }), []);

	useEffect(() => {
		if (state.hydrated) {
			save({ project: state.project, reachedByProject: state.reachedByProject });
		}
	}, [state]);

	// Another frame of this app (sidebar launcher vs. editor tab) changed the stored state: follow it.
	useEffect(() => {
		const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && dispatch({ type: 'hydrate', state: load() });
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	}, []);

	const go = useCallback((key: ScreenKey) => {
		const index = screenIndex(key);
		// A running screen means the step is starting or re-running, so every later step is stale.
		dispatch(SCREENS[index]?.kind === 'running' ? { type: 'rerun', index } : { type: 'reach', index });
		navigate.screen(key);
	}, [navigate]);

	const selectProject = useCallback((project: Project) => {
		dispatch({ type: 'setProject', project });
		// the studio may open in another frame (an IDE editor tab) that hydrates from storage right away
		save({ project, reachedByProject: progressRef.current });
	}, []);

	const resumeScreen = useCallback((project: Project): ScreenKey => SCREENS[progressRef.current[project.id] ?? 0]?.key ?? 'ready', []);

	const openProject = useCallback((project: Project) => {
		selectProject(project);
		navigate.screen(resumeScreen(project));
	}, [selectProject, resumeScreen, navigate]);

	const clear = useCallback(() => {
		dispatch({ type: 'reset' });
		save({ project: undefined, reachedByProject: progressRef.current });
	}, []);

	const exit = useCallback(() => {
		clear();
		navigate.closeStudio();
	}, [clear, navigate]);

	const reached = state.project ? state.reachedByProject[state.project.id] ?? 0 : 0;
	const value = useMemo(() => ({ ...state, reached, resumeScreen, go, selectProject, openProject, clear, exit, analyzeRerunComments, setAnalyzeRerunComments }), [state, reached, resumeScreen, go, selectProject, openProject, clear, exit, analyzeRerunComments]);
	return <MigrationContext.Provider value={value}>{children}</MigrationContext.Provider>;
}

export function useMigration(): MigrationContextValue {
	const value = useContext(MigrationContext);
	if (!value) {
		throw new Error('useMigration must be used inside <MigrationProvider>');
	}
	return value;
}

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReviewComment } from '@/features/migration/comments';
import { screenIndex, type ScreenKey } from '@/features/migration/steps';
import type { Project } from '@/features/migration/types';
import { useNavigate } from './useNavigate';

const STORAGE_KEY = 'migration-studio-state-v1';

interface State {
	readonly hydrated: boolean;
	readonly project: Project | undefined;
	/** Index (into SCREENS) of the furthest screen reached; later steps stay locked in the stepper. */
	readonly reached: number;
}

type Action =
	| { type: 'hydrate'; state: Omit<State, 'hydrated'> }
	| { type: 'setProject'; project: Project }
	| { type: 'reach'; index: number }
	| { type: 'reset' };

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case 'hydrate': return { ...action.state, hydrated: true };
		case 'setProject': return { ...state, project: action.project, reached: 0 };
		case 'reach': return { ...state, reached: Math.max(state.reached, action.index) };
		case 'reset': return { hydrated: true, project: undefined, reached: 0 };
	}
}

function load(): Omit<State, 'hydrated'> {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<State>;
			return { project: parsed.project, reached: typeof parsed.reached === 'number' ? parsed.reached : 0 };
		}
	} catch {
		// storage unavailable or corrupt: start fresh
	}
	return { project: undefined, reached: 0 };
}

function save(state: Omit<State, 'hydrated'>): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// not persisted
	}
}

interface MigrationContextValue extends State {
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

/** Project and progress state for the migration flow. Persisted to sessionStorage; host-owned state is a later phase. */
export function MigrationProvider({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate();
	const [state, dispatch] = useReducer(reducer, { hydrated: false, project: undefined, reached: 0 });
	const [analyzeRerunComments, setAnalyzeRerunComments] = useState<readonly ReviewComment[]>([]);

	useEffect(() => dispatch({ type: 'hydrate', state: load() }), []);

	useEffect(() => {
		if (state.hydrated) {
			save({ project: state.project, reached: state.reached });
		}
	}, [state]);

	// Another frame of this app (sidebar launcher vs. editor tab) changed the stored state: follow it.
	useEffect(() => {
		const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && dispatch({ type: 'hydrate', state: load() });
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	}, []);

	const go = useCallback((key: ScreenKey) => {
		dispatch({ type: 'reach', index: screenIndex(key) });
		navigate.screen(key);
	}, [navigate]);

	const selectProject = useCallback((project: Project) => {
		dispatch({ type: 'setProject', project });
		// the studio may open in another frame (an IDE editor tab) that hydrates from storage right away
		save({ project, reached: 0 });
	}, []);

	const openProject = useCallback((project: Project) => {
		selectProject(project);
		navigate.screen('ready');
	}, [selectProject, navigate]);

	const clear = useCallback(() => {
		dispatch({ type: 'reset' });
		save({ project: undefined, reached: 0 });
	}, []);

	const exit = useCallback(() => {
		clear();
		navigate.closeStudio();
	}, [clear, navigate]);

	const value = useMemo(() => ({ ...state, go, selectProject, openProject, clear, exit, analyzeRerunComments, setAnalyzeRerunComments }), [state, go, selectProject, openProject, clear, exit, analyzeRerunComments]);
	return <MigrationContext.Provider value={value}>{children}</MigrationContext.Provider>;
}

export function useMigration(): MigrationContextValue {
	const value = useContext(MigrationContext);
	if (!value) {
		throw new Error('useMigration must be used inside <MigrationProvider>');
	}
	return value;
}

'use client';

import { createContext, useContext } from 'react';

/**
 * The folders opened in the IDE, or undefined until the host has reported them.
 * Outside the IDE (plain browser) the folder comes from NEXT_PUBLIC_WORKSPACE_FOLDER, if set.
 */
export const WorkspaceContext = createContext<readonly string[] | undefined>(undefined);

export function useWorkspace(): readonly string[] | undefined {
	return useContext(WorkspaceContext);
}

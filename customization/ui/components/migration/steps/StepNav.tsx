'use client';

import { createContext, useContext } from 'react';

/** Element in the top bar (next to the project title) where step screens render their action buttons, owned by PhaseScreen. */
export const StepActionsSlotContext = createContext<HTMLElement | null>(null);

export function useStepActionsSlot(): HTMLElement | null {
	return useContext(StepActionsSlotContext);
}

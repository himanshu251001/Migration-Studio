'use client';

import { createContext, useContext } from 'react';
import type { ThemeKind } from '@/lib/hostBridge';

export const ThemeContext = createContext<ThemeKind | undefined>(undefined);

/** The IDE theme kind, or undefined until the host has pushed one. */
export function useHostTheme(): ThemeKind | undefined {
	return useContext(ThemeContext);
}

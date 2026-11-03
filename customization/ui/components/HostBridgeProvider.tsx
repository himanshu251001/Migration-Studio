'use client';

import { useEffect, useState } from 'react';
import { isInboundMessage, type OutboundMessage, type ThemeKind } from '@/lib/hostBridge';
import { ThemeContext } from '@/components/useHostTheme';

/** Connects to the IDE host: announces `ready` and applies pushed theme variables live. */
export function HostBridgeProvider({ children }: { children: React.ReactNode }) {
	const [themeKind, setThemeKind] = useState<ThemeKind | undefined>();

	useEffect(() => {
		if (window.parent === window) {
			return; // not embedded
		}
		const onMessage = (event: MessageEvent) => {
			if (event.source !== window.parent || !isInboundMessage(event.data)) {
				return;
			}
			const { kind, variables } = event.data.payload;
			for (const [name, value] of Object.entries(variables)) {
				document.documentElement.style.setProperty(name, value);
			}
			document.documentElement.dataset.theme = kind;
			setThemeKind(kind);
		};
		window.addEventListener('message', onMessage);
		const ready: OutboundMessage = { v: 1, type: 'ready', payload: { route: location.pathname } };
		// The host validates our origin; the parent origin is not knowable here, so the payload carries no secrets.
		window.parent.postMessage(ready, '*');
		return () => window.removeEventListener('message', onMessage);
	}, []);

	return <ThemeContext.Provider value={themeKind}>{children}</ThemeContext.Provider>;
}

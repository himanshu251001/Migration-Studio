'use client';

import { useEffect, useState } from 'react';
import { isEmbedded, isInboundMessage, postToHost, type ThemeKind } from '@/lib/hostBridge';
import { ThemeContext } from '@/components/useHostTheme';
import { WorkspaceContext } from '@/components/useWorkspace';

/** Connects to the IDE host: announces `ready` and applies pushed theme variables live. */
export function HostBridgeProvider({ children }: { children: React.ReactNode }) {
	const [themeKind, setThemeKind] = useState<ThemeKind | undefined>();
	// Outside the IDE there is no host to ask: use the configured dev folder (or none).
	const [folders, setFolders] = useState<readonly string[] | undefined>(() => isEmbedded() ? undefined : devFolders());

	useEffect(() => {
		if (!isEmbedded()) {
			return;
		}
		const onMessage = (event: MessageEvent) => {
			if (event.source !== window.parent || !isInboundMessage(event.data)) {
				return;
			}
			if (event.data.type === 'workspace') {
				setFolders(event.data.payload.folders);
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
		postToHost({ v: 1, type: 'ready', payload: { route: location.pathname } });
		return () => window.removeEventListener('message', onMessage);
	}, []);

	return (
		<ThemeContext.Provider value={themeKind}>
			<WorkspaceContext.Provider value={folders}>{children}</WorkspaceContext.Provider>
		</ThemeContext.Provider>
	);
}

function devFolders(): readonly string[] {
	const folder = process.env.NEXT_PUBLIC_WORKSPACE_FOLDER;
	return folder ? [folder] : [];
}

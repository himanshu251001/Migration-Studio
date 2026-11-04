/** Versioned message protocol between this app (iframe) and the IDE workbench. Keep in sync with
 * src/vs/workbench/contrib/customization/common/hostBridgeProtocol.ts. */
export const BRIDGE_VERSION = 1;

export type ThemeKind = 'light' | 'dark' | 'hcLight' | 'hcDark';

export interface ThemePayload {
	kind: ThemeKind;
	/** CSS custom properties, e.g. `--vscode-foreground` */
	variables: Record<string, string>;
}

export type OutboundMessage =
	| { v: 1; type: 'ready'; payload: { route: string } }
	/** Open `route` of this app in an editor tab. */
	| { v: 1; type: 'openEditor'; payload: { route: string; title: string } }
	/** Close the editor tab this app is shown in. */
	| { v: 1; type: 'closeEditor'; payload: Record<string, never> };
export interface WorkspacePayload {
	/** Absolute paths of the folders opened in the IDE. */
	folders: string[];
}

export type InboundMessage =
	| { v: 1; type: 'theme'; payload: ThemePayload }
	| { v: 1; type: 'workspace'; payload: WorkspacePayload };

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isInboundMessage(data: unknown): data is InboundMessage {
	if (!isObject(data) || data.v !== BRIDGE_VERSION || !isObject(data.payload)) {
		return false;
	}
	const payload = data.payload;
	switch (data.type) {
		case 'theme':
			return typeof payload.kind === 'string' && isObject(payload.variables)
				&& Object.entries(payload.variables).every(([k, v]) => k.startsWith('--vscode-') && typeof v === 'string');
		case 'workspace':
			return Array.isArray(payload.folders) && payload.folders.every(f => typeof f === 'string');
		default:
			return false;
	}
}

/** True when this app runs inside the IDE (an iframe of the workbench). */
export function isEmbedded(): boolean {
	return typeof window !== 'undefined' && window.parent !== window;
}

/** Sends a message to the IDE host. The host validates our origin; payloads carry no secrets. */
export function postToHost(message: OutboundMessage): void {
	window.parent.postMessage(message, '*');
}

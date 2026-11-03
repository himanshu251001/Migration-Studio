/** Versioned message protocol between this app (iframe) and the IDE workbench. Keep in sync with
 * src/vs/workbench/contrib/customization/common/hostBridgeProtocol.ts. */
export const BRIDGE_VERSION = 1;

export type ThemeKind = 'light' | 'dark' | 'hcLight' | 'hcDark';

export interface ThemePayload {
	kind: ThemeKind;
	/** CSS custom properties, e.g. `--vscode-foreground` */
	variables: Record<string, string>;
}

export type OutboundMessage = { v: 1; type: 'ready'; payload: { route: string } };
export type InboundMessage = { v: 1; type: 'theme'; payload: ThemePayload };

export function isInboundMessage(data: unknown): data is InboundMessage {
	if (typeof data !== 'object' || data === null) {
		return false;
	}
	const message = data as Partial<InboundMessage>;
	if (message.v !== BRIDGE_VERSION || message.type !== 'theme' || typeof message.payload !== 'object' || message.payload === null) {
		return false;
	}
	const { kind, variables } = message.payload as Partial<ThemePayload>;
	return typeof kind === 'string' && typeof variables === 'object' && variables !== null
		&& Object.entries(variables).every(([k, v]) => k.startsWith('--vscode-') && typeof v === 'string');
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Versioned `postMessage` protocol between the workbench and the embedded Next.js app.
 * Keep in sync with `customization/ui/lib/hostBridge.ts`.
 */
export const HOST_BRIDGE_VERSION = 1;

export type HostBridgeThemeKind = 'light' | 'dark' | 'hcLight' | 'hcDark';

/** Messages sent by the embedded app to the workbench. */
export interface IReadyMessage {
	readonly v: typeof HOST_BRIDGE_VERSION;
	readonly type: 'ready';
	readonly payload: { readonly route: string };
}

/** Asks the workbench to open `route` of the embedded app in an editor tab. */
export interface IOpenEditorMessage {
	readonly v: typeof HOST_BRIDGE_VERSION;
	readonly type: 'openEditor';
	readonly payload: { readonly route: string; readonly title: string };
}

/** Asks the workbench to close the editor tab the sending app is shown in. */
export interface ICloseEditorMessage {
	readonly v: typeof HOST_BRIDGE_VERSION;
	readonly type: 'closeEditor';
	readonly payload: Record<string, never>;
}

export type HostBridgeInboundMessage = IReadyMessage | IOpenEditorMessage | ICloseEditorMessage;

/** Messages sent by the workbench to the embedded app. */
export interface IThemeMessage {
	readonly v: typeof HOST_BRIDGE_VERSION;
	readonly type: 'theme';
	readonly payload: { readonly kind: HostBridgeThemeKind; readonly variables: Record<string, string> };
}

/** Tells the embedded app which folders are open in the IDE (absolute local paths). */
export interface IWorkspaceMessage {
	readonly v: typeof HOST_BRIDGE_VERSION;
	readonly type: 'workspace';
	readonly payload: { readonly folders: readonly string[] };
}

/**
 * Validates untrusted data received from the embedded app. Returns `undefined` for anything that is not a
 * known message of the current protocol version.
 */
export function parseInboundMessage(data: unknown): HostBridgeInboundMessage | undefined {
	if (typeof data !== 'object' || data === null) {
		return undefined;
	}
	const { v, type, payload } = data as { v?: unknown; type?: unknown; payload?: unknown };
	if (v !== HOST_BRIDGE_VERSION || typeof payload !== 'object' || payload === null) {
		return undefined;
	}
	const fields = payload as { route?: unknown; title?: unknown };
	switch (type) {
		case 'ready':
			return typeof fields.route === 'string' ? { v: HOST_BRIDGE_VERSION, type, payload: { route: fields.route } } : undefined;
		case 'openEditor':
			// Routes are paths inside the embedded app; anything else (absolute or protocol-relative URLs) is rejected.
			return typeof fields.route === 'string' && isAppRoute(fields.route) && typeof fields.title === 'string'
				? { v: HOST_BRIDGE_VERSION, type, payload: { route: fields.route, title: fields.title } }
				: undefined;
		case 'closeEditor':
			return { v: HOST_BRIDGE_VERSION, type, payload: {} };
		default:
			return undefined;
	}
}

/** Returns true for a path inside the embedded app, e.g. `/migration/ready`. */
export function isAppRoute(route: string): boolean {
	return route.startsWith('/') && !route.startsWith('//') && !route.includes('\\');
}

/** Returns true if `origin` is the origin of `baseUrl`. */
export function isTrustedOrigin(origin: string, baseUrl: string): boolean {
	try {
		return origin === new URL(baseUrl).origin;
	} catch {
		return false;
	}
}

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

/**
 * Asks the workbench to open a local file (for example a generated artifact) in a native editor, optionally at
 * `line` (1-based) and with a side preview. The workbench only honours paths inside an opened folder.
 */
export interface IOpenFileMessage {
	readonly v: typeof HOST_BRIDGE_VERSION;
	readonly type: 'openFile';
	readonly payload: { readonly path: string; readonly line?: number; readonly preview?: boolean };
}

export type HostBridgeInboundMessage = IReadyMessage | IOpenEditorMessage | ICloseEditorMessage | IOpenFileMessage;

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

/** Tells the embedded app to re-run the current step with the reviewer's pending comments. */
export interface IRerunWithCommentsMessage {
	readonly v: typeof HOST_BRIDGE_VERSION;
	readonly type: 'rerunWithComments';
	readonly payload: Record<string, never>;
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
	const fields = payload as { route?: unknown; title?: unknown; path?: unknown; line?: unknown; preview?: unknown };
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
		case 'openFile':
			if (typeof fields.path !== 'string' || !fields.path || fields.path.includes('\0')
				|| (fields.line !== undefined && (typeof fields.line !== 'number' || !Number.isInteger(fields.line) || fields.line < 1))
				|| (fields.preview !== undefined && typeof fields.preview !== 'boolean')) {
				return undefined;
			}
			return { v: HOST_BRIDGE_VERSION, type, payload: { path: fields.path, line: fields.line, preview: fields.preview } };
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

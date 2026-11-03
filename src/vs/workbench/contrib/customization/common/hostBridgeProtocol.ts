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

export type HostBridgeInboundMessage = IReadyMessage;

/** Messages sent by the workbench to the embedded app. */
export interface IThemeMessage {
	readonly v: typeof HOST_BRIDGE_VERSION;
	readonly type: 'theme';
	readonly payload: { readonly kind: HostBridgeThemeKind; readonly variables: Record<string, string> };
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
	if (type === 'ready' && typeof (payload as { route?: unknown }).route === 'string') {
		return { v: HOST_BRIDGE_VERSION, type, payload: { route: (payload as { route: string }).route } };
	}
	return undefined;
}

/** Returns true if `origin` is the origin of `baseUrl`. */
export function isTrustedOrigin(origin: string, baseUrl: string): boolean {
	try {
		return origin === new URL(baseUrl).origin;
	} catch {
		return false;
	}
}

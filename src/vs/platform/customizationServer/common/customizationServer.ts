/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const CUSTOMIZATION_SERVER_CHANNEL = 'customizationServer';

export type CustomizationServerStatus = 'starting' | 'ready' | 'failed';

export interface ICustomizationServerState {
	readonly status: CustomizationServerStatus;
	/** Base URL of the Next.js customization layer, set once `status` is `ready`. */
	readonly url?: string;
	/** Human readable failure reason, set when `status` is `failed`. */
	readonly error?: string;
}

/**
 * Owns the Next.js process that serves the customization layer (see `customization/`).
 * The server is started lazily on the first {@link getState} call.
 */
export interface ICustomizationServerService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeState: Event<ICustomizationServerState>;

	getState(): Promise<ICustomizationServerState>;

	/** Restarts the server after a failure. */
	retry(): Promise<ICustomizationServerState>;
}

export const ICustomizationServerService = createDecorator<ICustomizationServerService>('customizationServerService');

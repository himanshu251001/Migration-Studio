/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';

export type CustomizationFeatureLocation = 'sidebar';

/**
 * A feature of the Next.js customization layer (`customization/ui`).
 * Adding a feature to the IDE means adding an entry here plus a route in the Next.js app.
 */
export interface ICustomizationFeature {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
	/** Route inside the Next.js app, e.g. `/migration`. */
	readonly route: string;
	readonly location: CustomizationFeatureLocation;
	readonly order: number;
}

export const customizationFeatures: readonly ICustomizationFeature[] = [
	{
		id: 'migrationStudio',
		title: localize2('migrationStudio', "Migration Studio"),
		icon: Codicon.arrowSwap,
		route: '/',
		location: 'sidebar',
		order: 10
	}
];

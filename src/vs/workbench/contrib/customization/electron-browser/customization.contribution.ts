/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, WindowEnablement } from '../../../common/views.js';
import { customizationFeatures } from '../common/customizationRegistry.js';
import { CustomizationViewPane } from './customizationViewPane.js';

// Each feature of the Next.js customization layer gets an activity bar entry with a single view.
// To add a feature, add it to `customizationFeatures`.
for (const feature of customizationFeatures) {
	if (feature.location !== 'sidebar') {
		continue;
	}

	const containerId = `workbench.view.customization.${feature.id}`;
	const container = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
		id: containerId,
		title: feature.title,
		icon: feature.icon,
		order: feature.order,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [containerId, { mergeViewWithContainerWhenSingleView: true }]),
		storageId: containerId,
		hideIfEmpty: false,
		windowEnablement: WindowEnablement.Both
	}, ViewContainerLocation.Sidebar);

	Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
		id: `${containerId}.view`,
		name: feature.title,
		containerIcon: feature.icon,
		canToggleVisibility: false,
		canMoveView: false,
		ctorDescriptor: new SyncDescriptor(CustomizationViewPane, [feature])
	}], container);
}

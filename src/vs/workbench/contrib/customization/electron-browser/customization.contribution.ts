/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { EditorExtensions } from '../../../common/editor.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, WindowEnablement } from '../../../common/views.js';
import { customizationFeatures } from '../common/customizationRegistry.js';
import { CustomizationEditor } from './customizationEditor.js';
import { CustomizationEditorInput } from './customizationEditorInput.js';
import { CustomizationViewPane } from './customizationViewPane.js';

// Editor tab that hosts a route of the Next.js app at full editor size (opened by the app through the host bridge).
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(CustomizationEditor, CustomizationEditor.ID, localize('customization.editor', "Migration Studio")),
	[new SyncDescriptor(CustomizationEditorInput)]
);

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

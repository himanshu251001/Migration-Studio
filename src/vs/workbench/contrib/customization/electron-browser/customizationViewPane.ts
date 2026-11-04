/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customizationViewPane.css';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ICustomizationFeature } from '../common/customizationRegistry.js';
import { CustomizationEditorInput } from './customizationEditorInput.js';
import { CustomizationFrame } from './customizationFrame.js';

/**
 * Sidebar view of a feature of the Next.js customization layer. The sidebar is narrow, so it only shows the
 * feature's launcher route; the feature itself opens in an editor tab when the app asks for it.
 */
export class CustomizationViewPane extends ViewPane {

	private readonly frame = this._register(new MutableDisposable<CustomizationFrame>());
	private frameContainer: HTMLElement | undefined;

	constructor(
		private readonly feature: ICustomizationFeature,
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this.ensureLoaded();
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.frameContainer = container;
		if (this.isBodyVisible()) {
			this.ensureLoaded();
		}
	}

	override focus(): void {
		super.focus();
		this.frame.value?.focus();
	}

	/** The server is only started once the view is first shown. */
	private ensureLoaded(): void {
		if (!this.frame.value && this.frameContainer) {
			this.frame.value = this.instantiationService.createInstance(CustomizationFrame, this.frameContainer, this.feature.title.value, this.feature.route, {
				openEditor: (route, title) => this.editorService.openEditor(this.instantiationService.createInstance(CustomizationEditorInput, route, title)),
				closeEditor: () => { /* the sidebar view cannot be closed by the app */ }
			});
			this.frame.value.load();
		}
	}
}

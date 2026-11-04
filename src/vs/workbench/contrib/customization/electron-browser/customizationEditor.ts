/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customizationViewPane.css';
import { Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { CustomizationEditorInput } from './customizationEditorInput.js';
import { CustomizationFrame } from './customizationFrame.js';

/** Editor pane that fills the editor area with a route of the Next.js customization layer. */
export class CustomizationEditor extends EditorPane {

	static readonly ID = 'workbench.editor.customization';

	private container!: HTMLElement;
	private readonly frameStore = this._register(new DisposableStore());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(CustomizationEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = parent;
	}

	override async setInput(input: CustomizationEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		this.frameStore.clear();
		this.container.textContent = '';
		const frame = this.frameStore.add(this.instantiationService.createInstance(
			CustomizationFrame,
			this.container,
			input.getName(),
			input.route,
			{
				openEditor: () => { /* the editor tab is already open */ },
				closeEditor: () => this.group.closeEditor(input)
			}
		));
		frame.load();
	}

	override clearInput(): void {
		this.frameStore.clear();
		this.container.textContent = '';
		super.clearInput();
	}

	override layout(_dimension: Dimension): void {
		// the frame fills the container with CSS
	}
}

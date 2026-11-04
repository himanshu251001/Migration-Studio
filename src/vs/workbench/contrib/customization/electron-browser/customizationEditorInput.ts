/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

/** Editor tab showing a route of the Next.js customization layer, e.g. the Migration Studio flow. */
export class CustomizationEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.customization';

	/** Scheme of the (virtual) resource that identifies an input; the route is its path. */
	static readonly SCHEME = 'customization';

	readonly resource: URI;

	constructor(
		readonly route: string,
		private readonly title: string,
		private readonly icon: ThemeIcon = Codicon.arrowSwap
	) {
		super();
		const url = new URL(route, 'http://app');
		this.resource = URI.from({ scheme: CustomizationEditorInput.SCHEME, path: url.pathname, query: url.search.slice(1) });
	}

	override get typeId(): string {
		return CustomizationEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	override getName(): string {
		return this.title;
	}

	override getIcon(): ThemeIcon {
		return this.icon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || (other instanceof CustomizationEditorInput && other.resource.toString() === this.resource.toString());
	}
}

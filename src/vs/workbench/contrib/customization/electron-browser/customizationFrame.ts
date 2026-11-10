/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { localize } from '../../../../nls.js';
import { CUSTOMIZATION_SERVER_CHANNEL, ICustomizationServerService, ICustomizationServerState } from '../../../../platform/customizationServer/common/customizationServer.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { getColorRegistry } from '../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { Schemas } from '../../../../base/common/network.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { HOST_BRIDGE_VERSION, HostBridgeThemeKind, IRerunWithCommentsMessage, IThemeMessage, IWorkspaceMessage, isTrustedOrigin, parseInboundMessage } from '../common/hostBridgeProtocol.js';

/** If the embedded app does not announce itself within this time after loading, treat it as unavailable. */
const READY_TIMEOUT = 15_000;

/** Callbacks for requests the embedded app makes through the host bridge. */
export interface ICustomizationFrameHandlers {
	openEditor(route: string, title: string): void;
	closeEditor(): void;
}

/** The frames currently showing the app. */
const liveFrames = new Set<CustomizationFrame>();

CommandsRegistry.registerCommand('migrationStudio.rerunWithComments', () => {
	for (const frame of liveFrames) {
		frame.postRerunWithComments();
	}
});

/**
 * A sandboxed iframe hosting a route of the Next.js customization layer, including the
 * starting / unavailable (with Retry) states and the theme bridge. Used by the sidebar view and the editor tab.
 */
export class CustomizationFrame extends Disposable {

	private readonly server: ICustomizationServerService;
	private readonly frameDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly element: HTMLElement;

	private iframe: HTMLIFrameElement | undefined;
	private baseUrl: string | undefined;
	private loadRequested = false;

	constructor(
		container: HTMLElement,
		private readonly title: string,
		private readonly route: string,
		private readonly handlers: ICustomizationFrameHandlers,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		super();
		this.element = dom.append(container, dom.$('.customization-view'));
		liveFrames.add(this);
		this._register({ dispose: () => liveFrames.delete(this) });
		this.server = ProxyChannel.toService<ICustomizationServerService>(mainProcessService.getChannel(CUSTOMIZATION_SERVER_CHANNEL));
		this._register(this.server.onDidChangeState(state => this.onServerStateChanged(state)));
	}

	/** Starts the server (if needed) and loads the route. The first call does the work; later calls are no-ops. */
	load(): void {
		if (this.loadRequested) {
			return;
		}
		this.loadRequested = true;
		this.showStarting();
		this.server.getState().then(state => this.onServerStateChanged(state));
	}

	focus(): void {
		this.iframe?.focus();
	}

	private onServerStateChanged(state: ICustomizationServerState): void {
		if (!this.loadRequested) {
			return;
		}
		switch (state.status) {
			case 'starting':
				this.showStarting();
				break;
			case 'failed':
				this.showMessage(localize('customization.unavailable', "The Migration Studio server is unavailable."), state.error, true);
				break;
			case 'ready':
				if (state.url && state.url !== this.baseUrl) {
					this.showFrame(state.url);
				}
				break;
		}
	}

	private showStarting(): void {
		this.showMessage(localize('customization.starting', "Starting Migration Studio…"));
	}

	private showMessage(message: string, detail?: string, canRetry?: boolean): void {
		this.frameDisposables.clear();
		this.iframe = undefined;
		this.baseUrl = undefined;
		dom.clearNode(this.element);

		const messageElement = dom.append(this.element, dom.$('.customization-message'));
		dom.append(messageElement, dom.$('div', undefined, message));
		if (detail) {
			dom.append(messageElement, dom.$('div.customization-detail', undefined, detail));
		}
		if (canRetry) {
			const store = new DisposableStore();
			const retry = store.add(new Button(messageElement, { ...defaultButtonStyles }));
			retry.label = localize('customization.retry', "Retry");
			store.add(retry.onDidClick(() => {
				this.showStarting();
				this.server.retry().then(state => this.onServerStateChanged(state));
			}));
			this.frameDisposables.value = store;
		}
	}

	private showFrame(baseUrl: string): void {
		const store = new DisposableStore();
		this.frameDisposables.value = store;
		dom.clearNode(this.element);
		this.baseUrl = baseUrl;

		const iframe = this.iframe = dom.append(this.element, dom.$<HTMLIFrameElement>('iframe.customization-frame'));
		iframe.title = this.title;
		iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
		iframe.src = new URL(this.route, baseUrl).toString();

		const readyTimeout = setTimeout(() => this.showMessage(localize('customization.unavailable', "The Migration Studio server is unavailable."), localize('customization.noHandshake', "The embedded page did not respond."), true), READY_TIMEOUT);
		store.add({ dispose: () => clearTimeout(readyTimeout) });

		store.add(dom.addDisposableListener(dom.getWindow(this.element), 'message', (event: MessageEvent) => {
			if (event.source !== iframe.contentWindow || !isTrustedOrigin(event.origin, baseUrl)) {
				return;
			}
			const message = parseInboundMessage(event.data);
			switch (message?.type) {
				case 'ready':
					clearTimeout(readyTimeout);
					this.postTheme(this.themeService.getColorTheme());
					this.postWorkspace();
					break;
				case 'openEditor':
					this.handlers.openEditor(message.payload.route, message.payload.title);
					break;
				case 'closeEditor':
					this.handlers.closeEditor();
					break;
				case 'openFile':
					this.openFile(message.payload.path, message.payload.line, message.payload.preview);
					break;
			}
		}));
		store.add(this.themeService.onDidColorThemeChange(theme => this.postTheme(theme)));
		store.add(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.postWorkspace()));
	}

	/** Opens a file requested by the app: a markdown preview, or the read-only file, beside the current tab. Only files inside an opened folder are allowed. */
	private async openFile(path: string, line: number | undefined, preview: boolean | undefined): Promise<void> {
		const resource = URI.file(path);
		// A project's destination is usually a sibling of the opened folder, so generated artifacts
		// (`<dest>/.migration/artifacts/`) are allowed in addition to files inside an opened folder.
		const isArtifact = resource.path.includes('/.migration/artifacts/');
		if (!isArtifact && !this.workspaceContextService.getWorkspaceFolder(resource)) {
			return;
		}
		// Markdown opens as a preview only, beside the Migration tab; comments are added inside the preview.
		if (preview && resource.path.toLowerCase().endsWith('.md')) {
			await this.commandService.executeCommand('markdown.showPreviewToSide', resource);
			return;
		}
		// Anything else opens beside and pinned, so the Migration tab is never replaced or closed. Artifacts
		// are generated, so the file is read-only but can still be commented on.
		await this.filesConfigurationService.updateReadonly(resource, true);
		await this.editorService.openEditor({
			resource,
			options: { pinned: true, selection: line ? { startLineNumber: line, startColumn: 1 } : undefined }
		}, SIDE_GROUP);
	}

	/** Asks the app to re-run the current step with the pending review comments. */
	postRerunWithComments(): void {
		if (!this.iframe?.contentWindow || !this.baseUrl) {
			return;
		}
		const message: IRerunWithCommentsMessage = { v: HOST_BRIDGE_VERSION, type: 'rerunWithComments', payload: {} };
		this.iframe.contentWindow.postMessage(message, new URL(this.baseUrl).origin);
	}

	/** Tells the app which local folders are open, so it can detect their migration projects. */
	private postWorkspace(): void {
		if (!this.iframe?.contentWindow || !this.baseUrl) {
			return;
		}
		const folders = this.workspaceContextService.getWorkspace().folders
			.filter(folder => folder.uri.scheme === Schemas.file)
			.map(folder => folder.uri.fsPath);
		const message: IWorkspaceMessage = { v: HOST_BRIDGE_VERSION, type: 'workspace', payload: { folders } };
		this.iframe.contentWindow.postMessage(message, new URL(this.baseUrl).origin);
	}

	private postTheme(theme: IColorTheme): void {
		if (!this.iframe?.contentWindow || !this.baseUrl) {
			return;
		}
		const variables: Record<string, string> = {};
		for (const { id } of getColorRegistry().getColors()) {
			const color = theme.getColor(id);
			if (color) {
				variables['--vscode-' + id.replace('.', '-')] = color.toString();
			}
		}
		const style = dom.getWindow(this.element).getComputedStyle(this.element);
		for (const name of ['--vscode-font-family', '--vscode-font-size', '--vscode-editor-font-family']) {
			const value = style.getPropertyValue(name).trim();
			if (value) {
				variables[name] = value;
			}
		}
		const message: IThemeMessage = { v: HOST_BRIDGE_VERSION, type: 'theme', payload: { kind: toThemeKind(theme.type), variables } };
		this.iframe.contentWindow.postMessage(message, new URL(this.baseUrl).origin);
	}
}

function toThemeKind(scheme: ColorScheme): HostBridgeThemeKind {
	return scheme;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customizationViewPane.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ICustomizationServerState, ICustomizationServerService, CUSTOMIZATION_SERVER_CHANNEL } from '../../../../platform/customizationServer/common/customizationServer.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { getColorRegistry } from '../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ICustomizationFeature } from '../common/customizationRegistry.js';
import { HostBridgeThemeKind, HOST_BRIDGE_VERSION, IThemeMessage, isTrustedOrigin, parseInboundMessage } from '../common/hostBridgeProtocol.js';

/** If the embedded app does not announce itself within this time after loading, treat it as unavailable. */
const READY_TIMEOUT = 15_000;

/**
 * Hosts a feature of the Next.js customization layer in a sandboxed iframe and bridges the active
 * color theme to it via `postMessage`.
 */
export class CustomizationViewPane extends ViewPane {

	private readonly server: ICustomizationServerService;
	private readonly frameDisposables = this._register(new MutableDisposable<DisposableStore>());

	private frameHost!: HTMLElement;
	private iframe: HTMLIFrameElement | undefined;
	private baseUrl: string | undefined;
	private loadRequested = false;

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
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this.server = ProxyChannel.toService<ICustomizationServerService>(mainProcessService.getChannel(CUSTOMIZATION_SERVER_CHANNEL));

		this._register(this.server.onDidChangeState(state => this.onServerStateChanged(state)));
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this.ensureLoaded();
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.frameHost = dom.append(container, dom.$('.customization-view'));
		if (this.isBodyVisible()) {
			this.ensureLoaded();
		}
	}

	override focus(): void {
		super.focus();
		this.iframe?.focus();
	}

	/** The server is only started once the view is first shown. */
	private ensureLoaded(): void {
		if (this.loadRequested) {
			return;
		}
		this.loadRequested = true;
		this.showStarting();
		this.server.getState().then(state => this.onServerStateChanged(state));
	}

	private onServerStateChanged(state: ICustomizationServerState): void {
		if (!this.loadRequested || !this.frameHost) {
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
		dom.clearNode(this.frameHost);

		const messageElement = dom.append(this.frameHost, dom.$('.customization-message'));
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
		dom.clearNode(this.frameHost);
		this.baseUrl = baseUrl;

		const iframe = this.iframe = dom.append(this.frameHost, dom.$<HTMLIFrameElement>('iframe.customization-frame'));
		iframe.title = this.feature.title.value;
		iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
		iframe.src = new URL(this.feature.route, baseUrl).toString();

		const readyTimeout = setTimeout(() => this.showMessage(localize('customization.unavailable', "The Migration Studio server is unavailable."), localize('customization.noHandshake', "The embedded page did not respond."), true), READY_TIMEOUT);
		store.add({ dispose: () => clearTimeout(readyTimeout) });

		store.add(dom.addDisposableListener(dom.getWindow(this.frameHost), 'message', (event: MessageEvent) => {
			if (event.source !== iframe.contentWindow || !isTrustedOrigin(event.origin, baseUrl)) {
				return;
			}
			if (parseInboundMessage(event.data)?.type === 'ready') {
				clearTimeout(readyTimeout);
				this.postTheme(this.themeService.getColorTheme());
			}
		}));
		store.add(this.themeService.onDidColorThemeChange(theme => this.postTheme(theme)));
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
		const style = dom.getWindow(this.frameHost).getComputedStyle(this.frameHost);
		for (const name of ['--vscode-font-family', '--vscode-font-size']) {
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

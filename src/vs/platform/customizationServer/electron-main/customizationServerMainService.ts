/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, execFile, spawn } from 'child_process';
import { access } from 'fs/promises';
import { createServer } from 'net';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { join } from '../../../base/common/path.js';
import { isWindows } from '../../../base/common/platform.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILogService } from '../../log/common/log.js';
import { ICustomizationServerService, ICustomizationServerState } from '../common/customizationServer.js';

const LOOPBACK = '127.0.0.1';
const DEFAULT_PORT = 3939;
const HEALTH_PATH = '/api/health';
const HEALTH_POLL_INTERVAL = 500;
const HEALTH_TIMEOUT = 90_000; // `next dev` compiles on first request
const STDERR_TAIL_LENGTH = 2000;

/**
 * Starts the Next.js customization layer (dev server when running from sources, the bundled
 * standalone server when built), tracks its health and tears it down on dispose.
 *
 * Environment overrides: `VSCODE_CUSTOMIZATION_URL` (use an externally started server, nothing is spawned)
 * and `VSCODE_CUSTOMIZATION_PORT` (preferred port).
 */
export class CustomizationServerMainService extends Disposable implements ICustomizationServerService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<ICustomizationServerState>());
	readonly onDidChangeState = this._onDidChangeState.event;

	private state: ICustomizationServerState = { status: 'starting' };
	private startPromise: Promise<void> | undefined;
	private child: ChildProcess | undefined;
	private disposed = false;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) {
		super();
	}

	async getState(): Promise<ICustomizationServerState> {
		this.startPromise ??= this.start();
		await this.startPromise;
		return this.state;
	}

	async retry(): Promise<ICustomizationServerState> {
		if (this.state.status === 'failed') {
			this.stopChild();
			this.startPromise = undefined;
		}
		return this.getState();
	}

	private async start(): Promise<void> {
		this.setState({ status: 'starting' });
		let stderrTail = '';
		try {
			const externalUrl = process.env['VSCODE_CUSTOMIZATION_URL'];
			let url: string;
			if (externalUrl) {
				url = externalUrl.replace(/\/$/, '');
			} else {
				const port = await this.pickPort(Number(process.env['VSCODE_CUSTOMIZATION_PORT']) || DEFAULT_PORT);
				url = `http://${LOOPBACK}:${port}`;
				const child = await this.spawnServer(port);
				this.child = child;
				child.stderr?.on('data', (data: Buffer) => stderrTail = (stderrTail + data.toString()).slice(-STDERR_TAIL_LENGTH));
				child.once('exit', code => {
					if (this.child === child) {
						this.child = undefined;
						if (!this.disposed) {
							this.logService.error(`[customization] server exited unexpectedly (code ${code}): ${stderrTail}`);
							this.setState({ status: 'failed', error: `Server exited with code ${code}.` });
						}
					}
				});
				child.once('error', err => {
					this.logService.error('[customization] failed to spawn server', err);
					this.setState({ status: 'failed', error: err.message });
				});
			}

			await this.waitForHealthy(url);
			if (this.state.status !== 'failed') {
				this.logService.info(`[customization] server ready at ${url}`);
				this.setState({ status: 'ready', url });
			}
		} catch (error) {
			this.logService.error('[customization] server failed to start', error, stderrTail);
			this.stopChild();
			this.setState({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
		}
	}

	private async spawnServer(port: number): Promise<ChildProcess> {
		const uiRoot = join(this.environmentMainService.appRoot, 'customization', 'ui');
		const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), HOSTNAME: LOOPBACK, NODE_ENV: this.environmentMainService.isBuilt ? 'production' : 'development' };

		let cwd: string;
		let args: string[];
		if (this.environmentMainService.isBuilt) {
			cwd = join(uiRoot, '.next', 'standalone');
			args = [join(cwd, 'server.js')];
		} else {
			cwd = uiRoot;
			args = [join(uiRoot, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-H', LOOPBACK, '-p', String(port)];
		}

		if (!await access(args[0]).then(() => true, () => false)) {
			throw new Error(`Customization server entry point not found: ${args[0]}. Run "npm install" in customization/ui (or build it for packaged builds).`);
		}

		this.logService.info(`[customization] starting server: ${args.join(' ')}`);
		return spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'ignore', 'pipe'], detached: !isWindows, windowsHide: true });
	}

	private async waitForHealthy(url: string): Promise<void> {
		const deadline = Date.now() + HEALTH_TIMEOUT;
		while (!this.disposed && this.state.status !== 'failed') {
			try {
				const response = await fetch(url + HEALTH_PATH, { signal: AbortSignal.timeout(5000) });
				if (response.ok) {
					return;
				}
			} catch {
				// not up yet
			}
			if (Date.now() > deadline) {
				throw new Error(`Timed out waiting for the customization server at ${url}.`);
			}
			await new Promise(resolve => setTimeout(resolve, HEALTH_POLL_INTERVAL));
		}
	}

	/** Returns `preferred` if it is free on loopback, otherwise an OS assigned free port. */
	private async pickPort(preferred: number): Promise<number> {
		const tryListen = (port: number) => new Promise<number | undefined>(resolve => {
			const server = createServer();
			server.once('error', () => resolve(undefined));
			server.listen(port, LOOPBACK, () => {
				const address = server.address();
				const actual = typeof address === 'object' && address ? address.port : undefined;
				server.close(() => resolve(actual));
			});
		});

		const port = await tryListen(preferred) ?? await tryListen(0);
		if (port === undefined) {
			throw new Error('No free local port available for the customization server.');
		}
		return port;
	}

	private setState(state: ICustomizationServerState): void {
		this.state = state;
		this._onDidChangeState.fire(state);
	}

	private stopChild(): void {
		const child = this.child;
		this.child = undefined;
		if (!child || child.pid === undefined || child.exitCode !== null) {
			return;
		}
		try {
			if (isWindows) {
				execFile('taskkill', ['/pid', String(child.pid), '/T', '/F']);
			} else {
				process.kill(-child.pid, 'SIGTERM'); // detached: kill the whole process group
			}
		} catch (error) {
			this.logService.warn('[customization] failed to stop server', error);
		}
	}

	override dispose(): void {
		this.disposed = true;
		this.stopChild();
		super.dispose();
	}
}

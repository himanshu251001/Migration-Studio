/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Line comments on generated Migration Studio artifacts, stored next to the artifacts in
 * `<dest>/.migration/artifacts/.comments.json`, keyed by the artifact's file name.
 *
 * - Markdown artifacts are commented on inside the markdown preview: a markdown-it plugin adds a comment link
 *   and the stored comments under every block. The link is a URI handled by this extension.
 * - Other artifacts (for example JSON) use native editor comments.
 */

const ARTIFACT_MARKER = '/.migration/artifacts/';
const COMMENTS_FILE = '.comments.json';
const EXTENSION_ID = 'vscode.migration-studio-comments';

interface IStoredComment {
	readonly body: string;
	readonly author: string;
	readonly timestamp: string;
}

interface IStoredThread {
	readonly id: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly comments: readonly IStoredComment[];
}

/** Trash icon of the delete link; uses the text color so it follows the theme. */
const DELETE_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6 1h4a1 1 0 0 1 1 1v1h3v1h-1v9.5a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 4 13.5V4H3V3h3V2a1 1 0 0 1 0-1zm0 2h4V2H6v1zM5 4v9.5a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V4H5zm1.5 2h1v6h-1V6zm2 0h1v6h-1V6z"/></svg>';

type Store = Record<string, IStoredThread[]>;

function isArtifact(uri: vscode.Uri): boolean {
	return uri.scheme === 'file' && uri.path.includes(ARTIFACT_MARKER) && path.basename(uri.fsPath) !== COMMENTS_FILE;
}

function isMarkdown(fsPath: string): boolean {
	return fsPath.toLowerCase().endsWith('.md');
}

/** Reads and writes the store files; keeps an in-memory copy so synchronous markdown rendering can use it. */
class StoreCache {

	private readonly stores = new Map<string, Store>();
	private readonly loading = new Map<string, Promise<Store>>();
	private readonly written = new Map<string, string>();
	private queue: Promise<unknown> = Promise.resolve();

	/** The loaded store of an artifact folder, if it has been loaded already. */
	peek(dir: string): Store | undefined {
		return this.stores.get(dir);
	}

	load(dir: string): Promise<Store> {
		let pending = this.loading.get(dir);
		if (!pending) {
			pending = this.read(dir).then(store => {
				this.stores.set(dir, store);
				return store;
			});
			this.loading.set(dir, pending);
		}
		return pending;
	}

	/** Applies `change` to the store of `dir` and writes it back. Changes are applied one at a time. */
	update(dir: string, change: (store: Store) => void): Promise<void> {
		const run = async () => {
			const store = await this.load(dir);
			change(store);
			const text = JSON.stringify(store, undefined, '\t') + '\n';
			this.written.set(dir, text);
			await fs.promises.writeFile(path.join(dir, COMMENTS_FILE), text, 'utf8');
		};
		const result = this.queue.then(run);
		this.queue = result.catch(() => undefined);
		return result;
	}

	/**
	 * Re-reads the store of `dir` after the file was changed by someone else (for example the app removing the
	 * comments that were sent with a re-run). Returns false when the change was this cache's own write.
	 */
	async reloadIfExternal(dir: string): Promise<boolean> {
		let text: string;
		try {
			text = await fs.promises.readFile(path.join(dir, COMMENTS_FILE), 'utf8');
		} catch {
			text = '';
		}
		if (text === (this.written.get(dir) ?? '')) {
			return false;
		}
		await this.queue;
		this.written.set(dir, text);
		try {
			this.stores.set(dir, text ? JSON.parse(text) as Store : {});
		} catch {
			return false;
		}
		this.loading.set(dir, Promise.resolve(this.stores.get(dir)!));
		return true;
	}

	private async read(dir: string): Promise<Store> {
		try {
			return JSON.parse(await fs.promises.readFile(path.join(dir, COMMENTS_FILE), 'utf8')) as Store;
		} catch {
			return {};
		}
	}
}

// Minimal shapes of the markdown-it objects used by the preview plugin.
interface IToken {
	type: string;
	content: string;
	level: number;
	nesting: number;
	map: [number, number] | null;
}
interface IMarkdownIt {
	utils: { escapeHtml(text: string): string };
	renderer: { rules: Record<string, (tokens: IToken[], idx: number, options: unknown, env: { currentDocument?: vscode.Uri }) => string> };
	core: { ruler: { push(name: string, rule: (state: { tokens: IToken[]; env: { currentDocument?: vscode.Uri }; Token: new (type: string, tag: string, nesting: number) => IToken }) => void): void } };
}

function actionUri(action: 'add' | 'delete' | 'rerun', file: string, params: Record<string, string> = {}): string {
	const query = new URLSearchParams({ file, ...params }).toString();
	return `${vscode.env.uriScheme}://${EXTENSION_ID}/${action}?${query}`;
}

export function activate(context: vscode.ExtensionContext) {
	const cache = new StoreCache();
	const userName = os.userInfo().username;

	// Native comments (non-markdown artifacts)

	const controller = vscode.comments.createCommentController('migrationStudioArtifacts', 'Migration Studio Artifacts');
	context.subscriptions.push(controller);
	controller.commentingRangeProvider = {
		provideCommentingRanges(document: vscode.TextDocument): vscode.Range[] {
			return isArtifact(document.uri) && !isMarkdown(document.uri.fsPath)
				? [new vscode.Range(0, 0, Math.max(document.lineCount - 1, 0), 0)]
				: [];
		}
	};

	/** Live native thread -> its stored id. */
	const nativeThreads = new Map<vscode.CommentThread, string>();
	const loaded = new Set<string>();

	function makeComment(body: string, name: string, timestamp?: string): vscode.Comment {
		return {
			body: new vscode.MarkdownString(body),
			mode: vscode.CommentMode.Preview,
			author: { name },
			timestamp: timestamp ? new Date(timestamp) : new Date()
		};
	}

	function toStored(thread: vscode.CommentThread, id: string): IStoredThread {
		return {
			id,
			startLine: thread.range?.start.line ?? 0,
			endLine: thread.range?.end.line ?? 0,
			comments: thread.comments.map(c => ({
				body: typeof c.body === 'string' ? c.body : c.body.value,
				author: c.author.name,
				timestamp: (c.timestamp ?? new Date()).toISOString()
			}))
		};
	}

	/** Rewrites the stored threads of the artifact that `uri` belongs to from the live native threads. */
	function saveNative(uri: vscode.Uri): Promise<void> {
		const name = path.basename(uri.fsPath);
		const threads = [...nativeThreads].filter(([thread]) => thread.uri.fsPath === uri.fsPath && thread.comments.length > 0).map(([thread, id]) => toStored(thread, id));
		return cache.update(path.dirname(uri.fsPath), store => { store[name] = threads; });
	}

	async function loadNative(document: vscode.TextDocument): Promise<void> {
		const uri = document.uri;
		if (!isArtifact(uri) || isMarkdown(uri.fsPath) || loaded.has(uri.toString())) {
			return;
		}
		loaded.add(uri.toString());
		const name = path.basename(uri.fsPath);
		for (const stored of (await cache.load(path.dirname(uri.fsPath)))[name] ?? []) {
			const thread = controller.createCommentThread(uri, new vscode.Range(stored.startLine, 0, stored.endLine, 0), stored.comments.map(c => makeComment(c.body, c.author, c.timestamp)));
			thread.canReply = true;
			thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
			nativeThreads.set(thread, stored.id);
		}
	}

	async function addNative(reply: vscode.CommentReply): Promise<void> {
		const thread = reply.thread;
		thread.comments = [...thread.comments, makeComment(reply.text, userName)];
		thread.canReply = true;
		if (!nativeThreads.has(thread)) {
			nativeThreads.set(thread, crypto.randomUUID());
		}
		await saveNative(thread.uri);
	}

	async function deleteNativeThread(thread: vscode.CommentThread): Promise<void> {
		const uri = thread.uri;
		nativeThreads.delete(thread);
		thread.dispose();
		await saveNative(uri);
	}

	// Markdown preview comments

	function refreshPreview(): Thenable<unknown> {
		return vscode.commands.executeCommand('markdown.preview.refresh');
	}

	function renderThreads(md: IMarkdownIt, threads: readonly IStoredThread[], file: string): string {
		return threads.map(thread => {
			const comments = thread.comments.map(c => `<div class="ms-comment"><span class="ms-comment-author">Comment</span> <span class="ms-comment-time">${md.utils.escapeHtml(new Date(c.timestamp).toLocaleString())}</span><div class="ms-comment-body">${md.utils.escapeHtml(c.body)}</div></div>`).join('');
			return `<div class="ms-thread">${comments}<a class="ms-comment-delete" href="${md.utils.escapeHtml(actionUri('delete', file, { id: thread.id }))}" title="Delete Comment" aria-label="Delete Comment">${DELETE_ICON}</a></div>`;
		}).join('');
	}

	/** The stored comments of the artifact, loading them (and rendering again) on first use. */
	function threadsOf(document: vscode.Uri): readonly IStoredThread[] {
		const dir = path.dirname(document.fsPath);
		const store = cache.peek(dir);
		if (!store) {
			cache.load(dir).then(() => refreshPreview());
		}
		return store?.[path.basename(document.fsPath)] ?? [];
	}

	function isCommentable(document: vscode.Uri | undefined): document is vscode.Uri {
		return !!document && isArtifact(document) && isMarkdown(document.fsPath);
	}

	/** markdown-it plugin: adds a "+" before and the stored comments after every top-level block of an artifact. */
	function extendMarkdownIt(md: IMarkdownIt): IMarkdownIt {
		// The document is only known at render time, so parsing adds marker tokens and rendering decides what they show.
		md.renderer.rules.ms_comment_add = (tokens, idx, _options, env) => {
			const document = env.currentDocument;
			const map = tokens[idx].map;
			return isCommentable(document) && map
				? `<div class="ms-comment-add-wrap"><a class="ms-comment-add" title="Add comment" data-ms-line="${map[0]}" href="${md.utils.escapeHtml(actionUri('add', document.fsPath, { line: String(map[0]) }))}">+</a></div>\n`
				: '';
		};
		md.renderer.rules.ms_comment_threads = (tokens, idx, _options, env) => {
			const document = env.currentDocument;
			const map = tokens[idx].map;
			if (!isCommentable(document) || !map) {
				return '';
			}
			const inBlock = threadsOf(document).filter(t => t.startLine >= map[0] && t.startLine < map[1]);
			const addUri = md.utils.escapeHtml(actionUri('add', document.fsPath, { line: String(map[0]) }));
			return `<div class="ms-comment-block" data-ms-line="${map[0]}" data-ms-add-uri="${addUri}">${renderThreads(md, inBlock, document.fsPath)}`
				+ '<div class="ms-form" hidden><textarea class="ms-form-text" rows="4" placeholder="Type a new comment"></textarea>'
				+ '<div class="ms-form-actions"><button type="button" class="ms-form-cancel">Cancel</button><a class="ms-form-submit" href="#">Add Comment</a></div></div></div>\n';
		};
		md.renderer.rules.ms_comment_rerun = (_tokens, _idx, _options, env) => {
			const document = env.currentDocument;
			return isCommentable(document) && threadsOf(document).length > 0
				? `<div class="ms-comment-rerun-wrap"><a class="ms-comment-rerun" href="${md.utils.escapeHtml(actionUri('rerun', document.fsPath))}">Re-run with Comments</a></div>\n`
				: '';
		};
		md.core.ruler.push('migration_studio_comments', state => {
			const marker = (type: string, map: [number, number]): IToken => {
				const token = new state.Token(type, '', 0);
				token.map = map;
				return token;
			};

			const result: IToken[] = [];
			let openMap: [number, number] | null = null;
			for (const token of state.tokens) {
				if (token.level === 0 && token.map && token.nesting !== -1) {
					result.push(marker('ms_comment_add', token.map));
				}
				result.push(token);
				if (token.level !== 0 || !token.map && token.nesting !== -1) {
					continue;
				}
				if (token.nesting === 1) {
					openMap = token.map;
				} else if (token.nesting === -1 && openMap) {
					result.push(marker('ms_comment_threads', openMap));
					openMap = null;
				} else if (token.nesting === 0 && token.map) {
					result.push(marker('ms_comment_threads', token.map));
				}
			}
			result.push(marker('ms_comment_rerun', [0, 0]));
			state.tokens.splice(0, state.tokens.length, ...result);
		});
		return md;
	}

	/** Parses and checks the artifact path of a preview link. */
	function artifactOf(params: URLSearchParams): vscode.Uri | undefined {
		const file = params.get('file');
		const uri = file ? vscode.Uri.file(file) : undefined;
		return uri && isArtifact(uri) && isMarkdown(uri.fsPath) ? uri : undefined;
	}

	/** Disposes native threads that are no longer in the store (their comments were removed on disk). */
	function syncNative(dir: string, store: Store): void {
		const live = new Set(Object.values(store).flat().map(t => t.id));
		for (const [thread, id] of [...nativeThreads]) {
			if (path.dirname(thread.uri.fsPath) === dir && !live.has(id)) {
				nativeThreads.delete(thread);
				thread.dispose();
			}
		}
	}

	/** Closes the open artifact editors and their markdown previews, so a re-run starts with nothing of the old artifacts open. */
	async function closeArtifactEditors(): Promise<void> {
		const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => {
			const input = tab.input;
			if (input instanceof vscode.TabInputText) {
				return isArtifact(input.uri);
			}
			if (input instanceof vscode.TabInputWebview && input.viewType.endsWith('markdown.preview')) {
				return /^Preview /.test(tab.label) && vscode.workspace.textDocuments.some(d => isArtifact(d.uri) && tab.label === `Preview ${path.basename(d.uri.fsPath)}`);
			}
			return false;
		});
		await vscode.window.tabGroups.close(tabs);
	}

	const commentsWatcher = vscode.workspace.createFileSystemWatcher(`**/.migration/artifacts/${COMMENTS_FILE}`);
	const onCommentsFileChanged = async (uri: vscode.Uri) => {
		const dir = path.dirname(uri.fsPath);
		if (await cache.reloadIfExternal(dir)) {
			syncNative(dir, cache.peek(dir) ?? {});
			await refreshPreview();
		}
	};

	context.subscriptions.push(
		commentsWatcher,
		commentsWatcher.onDidChange(onCommentsFileChanged),
		commentsWatcher.onDidCreate(onCommentsFileChanged),
		vscode.window.registerUriHandler({
			async handleUri(uri: vscode.Uri): Promise<void> {
				const params = new URLSearchParams(uri.query);
				const artifact = artifactOf(params);
				if (!artifact) {
					return;
				}
				const dir = path.dirname(artifact.fsPath);
				const name = path.basename(artifact.fsPath);
				if (uri.path === '/rerun') {
					await closeArtifactEditors();
					await vscode.commands.executeCommand('migrationStudio.rerunWithComments');
					// The app removes the sent comments from the store; pick that up even if the file watcher misses it.
					setTimeout(() => void onCommentsFileChanged(vscode.Uri.file(path.join(dir, COMMENTS_FILE))), 2000);
					return;
				}
				if (uri.path === '/add') {
					const line = Number(params.get('line'));
					if (!Number.isInteger(line) || line < 0) {
						return;
					}
					const text = params.get('text') ?? await vscode.window.showInputBox({
						title: `Comment on ${name} (line ${line + 1})`,
						prompt: 'Add a comment',
						placeHolder: 'Write a comment...',
						validateInput: value => value.trim() ? undefined : 'A comment cannot be empty.'
					});
					if (!text?.trim()) {
						return;
					}
					await cache.update(dir, store => {
						(store[name] ??= []).push({ id: crypto.randomUUID(), startLine: line, endLine: line, comments: [{ body: text.trim(), author: userName, timestamp: new Date().toISOString() }] });
					});
				} else if (uri.path === '/delete') {
					const id = params.get('id');
					await cache.update(dir, store => {
						store[name] = (store[name] ?? []).filter(t => t.id !== id);
					});
				} else {
					return;
				}
				await refreshPreview();
			}
		}),
		vscode.workspace.onDidOpenTextDocument(loadNative),
		vscode.commands.registerCommand('migrationStudioComments.createNote', addNative),
		vscode.commands.registerCommand('migrationStudioComments.replyNote', addNative),
		vscode.commands.registerCommand('migrationStudioComments.deleteNote', async (comment: vscode.Comment & { parent?: vscode.CommentThread }) => {
			const thread = comment.parent;
			if (!thread) {
				return;
			}
			const remaining = thread.comments.filter(c => c !== comment);
			if (remaining.length === 0) {
				await deleteNativeThread(thread);
			} else {
				thread.comments = remaining;
				await saveNative(thread.uri);
			}
		}),
		vscode.commands.registerCommand('migrationStudioComments.deleteThread', deleteNativeThread)
	);

	vscode.workspace.textDocuments.forEach(loadNative);

	// The markdown extension calls this to add the plugin to the preview.
	return { extendMarkdownIt };
}

export function deactivate(): void { }

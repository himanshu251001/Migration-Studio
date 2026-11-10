import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isSameOrigin } from '@/lib/server/sameOrigin';

export const dynamic = 'force-dynamic';

const ARTIFACT_FOLDER = path.join('.migration', 'artifacts');
/** Owned by the comments extension, which reloads it when it changes on disk. */
const COMMENTS_FILE = '.comments.json';

interface StoredComment {
	readonly body: string;
	readonly author: string;
	readonly timestamp: string;
}

interface StoredThread {
	readonly id: string;
	readonly startLine: number;
	readonly endLine?: number;
	readonly comments: readonly StoredComment[];
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
	try {
		return JSON.parse(await readFile(file, 'utf8')) as T;
	} catch {
		return fallback;
	}
}

function artifactDir(dest: unknown): string | undefined {
	return typeof dest === 'string' && path.isAbsolute(dest) ? path.resolve(dest, ARTIFACT_FOLDER) : undefined;
}

/** Query: `?dest=<absolute project folder>`. Returns `{ comments: [{ id, artifact, line, text, author }] }` for the artifacts. `line` is 1-based. */
export async function GET(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	const dir = artifactDir(new URL(request.url).searchParams.get('dest'));
	if (!dir) {
		return Response.json({ error: 'Expected an absolute dest.' }, { status: 400 });
	}
	const store = await readJson<Record<string, StoredThread[]>>(path.join(dir, COMMENTS_FILE), {});
	const comments = Object.entries(store).flatMap(([artifact, threads]) => threads
		.filter(thread => thread.comments.length > 0)
		.map(thread => ({
			id: thread.id,
			artifact,
			line: thread.startLine + 1,
			text: thread.comments.map(c => c.body).join('\n'),
			author: thread.comments[0].author
		})));
	return Response.json({ comments });
}

/**
 * Body: `{ dest: string, ids: string[] }`. Removes those threads: they were sent with a re-run, so the regenerated
 * artifacts start without them.
 */
export async function POST(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	const body = await request.json().catch(() => undefined) as { dest?: unknown; ids?: unknown } | undefined;
	const dir = artifactDir(body?.dest);
	if (!dir || !Array.isArray(body?.ids) || !body.ids.every(id => typeof id === 'string')) {
		return Response.json({ error: 'Expected { dest (absolute), ids: string[] }.' }, { status: 400 });
	}
	const file = path.join(dir, COMMENTS_FILE);
	const sent = new Set(body.ids as string[]);
	const store = await readJson<Record<string, StoredThread[]>>(file, {});
	const remaining = Object.fromEntries(Object.entries(store).map(([artifact, threads]) => [artifact, threads.filter(thread => !sent.has(thread.id))]));
	await writeFile(file, JSON.stringify(remaining, undefined, '\t') + '\n', 'utf8');
	return Response.json({ ok: true });
}

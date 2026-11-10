import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isSameOrigin } from '@/lib/server/sameOrigin';

export const dynamic = 'force-dynamic';

const ARTIFACT_FOLDER = path.join('.migration', 'artifacts');

/** Body: `{ dest: string, path: string, content: string }`. Writes `<dest>/.migration/artifacts/<path>` and returns its absolute path. */
export async function POST(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	const body = await request.json().catch(() => undefined) as { dest?: unknown; path?: unknown; content?: unknown } | undefined;
	if (typeof body?.dest !== 'string' || typeof body.path !== 'string' || typeof body.content !== 'string' || !path.isAbsolute(body.dest) || !body.path) {
		return Response.json({ error: 'Expected { dest (absolute), path, content }.' }, { status: 400 });
	}
	const root = path.resolve(body.dest, ARTIFACT_FOLDER);
	const target = path.resolve(root, body.path);
	if (!target.startsWith(root + path.sep)) {
		return Response.json({ error: 'Artifact path must stay inside the artifact folder.' }, { status: 400 });
	}
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, body.content, 'utf8');
	return Response.json({ path: target });
}

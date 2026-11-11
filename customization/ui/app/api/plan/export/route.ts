import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isSameOrigin } from '@/lib/server/sameOrigin';

export const dynamic = 'force-dynamic';

const EXPORT_FOLDER = 'migration';

/** Body: `{ dest, file, content }`. Writes `<dest>/migration/<file>`, creating `migration` when `dest` exists, and returns the absolute path. */
export async function POST(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	const body = await request.json().catch(() => undefined) as { dest?: unknown; file?: unknown; content?: unknown } | undefined;
	if (typeof body?.dest !== 'string' || typeof body.file !== 'string' || typeof body.content !== 'string' || !path.isAbsolute(body.dest) || !body.file) {
		return Response.json({ error: 'Expected { dest (absolute), file, content }.' }, { status: 400 });
	}
	const destination = await stat(body.dest).catch(() => undefined);
	if (!destination?.isDirectory()) {
		return Response.json({ error: `The destination folder does not exist: ${body.dest}` }, { status: 400 });
	}
	const root = path.resolve(body.dest, EXPORT_FOLDER);
	const target = path.resolve(root, body.file);
	if (!target.startsWith(root + path.sep)) {
		return Response.json({ error: 'File must stay inside the migration folder.' }, { status: 400 });
	}
	await mkdir(root, { recursive: true });
	await writeFile(target, body.content, 'utf8');
	return Response.json({ path: target });
}

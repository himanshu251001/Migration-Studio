import { detectProjects } from '@/lib/server/projectStore';
import { isSameOrigin } from '@/lib/server/sameOrigin';

export const dynamic = 'force-dynamic';

/** Body: `{ folders: string[] }` (the folders opened in the IDE). Returns the projects found in them. */
export async function POST(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	const body = await request.json().catch(() => undefined) as { folders?: unknown } | undefined;
	if (!Array.isArray(body?.folders) || !body.folders.every(f => typeof f === 'string')) {
		return Response.json({ error: 'Expected { folders: string[] }.' }, { status: 400 });
	}
	return Response.json({ projects: await detectProjects(body.folders) });
}

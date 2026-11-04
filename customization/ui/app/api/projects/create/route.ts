import { createProject, ProjectStoreError } from '@/lib/server/projectStore';
import { isSameOrigin } from '@/lib/server/sameOrigin';

export const dynamic = 'force-dynamic';

/** Body: `{ folder: string, draft: { name, description, source, dest } }`. Returns the created project. */
export async function POST(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	const body = await request.json().catch(() => undefined) as { folder?: unknown; draft?: Record<string, unknown> } | undefined;
	const draft = body?.draft;
	if (typeof body?.folder !== 'string' || !draft || ['name', 'description', 'source', 'dest'].some(k => typeof draft[k] !== 'string')) {
		return Response.json({ error: 'Expected { folder, draft: { name, description, source, dest } }.' }, { status: 400 });
	}
	try {
		const project = await createProject(body.folder, { name: draft.name as string, description: draft.description as string, source: draft.source as string, dest: draft.dest as string });
		return Response.json({ project });
	} catch (error) {
		if (error instanceof ProjectStoreError) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		throw error;
	}
}

import { checkBackend } from '@/lib/server/backendCheck';
import { isSameOrigin } from '@/lib/server/sameOrigin';

export const dynamic = 'force-dynamic';

/** Reports whether MongoDB is reachable and the Claude CLI starts, using the stored settings. */
export async function GET(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	return Response.json(await checkBackend());
}

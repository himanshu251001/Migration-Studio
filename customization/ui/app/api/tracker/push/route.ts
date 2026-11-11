import { TRACKERS, type TrackerProvider } from '@/features/migration/tracker';
import type { BacklogMilestone } from '@/features/migration/stories';
import { isSameOrigin } from '@/lib/server/sameOrigin';
import { AuthError, pushToGitHub } from '@/lib/server/tracker/github';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2_000_000;

/**
 * Body: `{ provider, target, token, plan }`. The token is used for the outbound calls only: it is never logged,
 * stored or echoed back, and error messages are built from fixed text rather than from upstream responses.
 */
export async function POST(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) {
		return Response.json({ error: 'Plan is too large to push.' }, { status: 413 });
	}
	let body: { provider?: unknown; target?: unknown; token?: unknown; plan?: unknown } | undefined;
	try {
		body = JSON.parse(text);
	} catch {
		body = undefined;
	}
	const option = TRACKERS.find(t => t.id === body?.provider);
	if (!option || typeof body?.target !== 'string' || typeof body.token !== 'string' || !body.token.trim() || !Array.isArray(body.plan) || !option.targetPattern.test(body.target)) {
		return Response.json({ error: 'Expected { provider, target, token, plan } with a valid target.' }, { status: 400 });
	}
	if (!option.available) {
		return Response.json({ error: `${option.label} is not supported yet.` }, { status: 501 });
	}
	try {
		const result = await pushToGitHub(body.token.trim(), body.target, body.plan as BacklogMilestone[]);
		return Response.json(result);
	} catch (e) {
		const provider: TrackerProvider = option.id;
		const message = e instanceof AuthError ? e.message : `Could not reach ${provider}.`;
		return Response.json({ error: message }, { status: e instanceof AuthError ? 401 : 502 });
	}
}

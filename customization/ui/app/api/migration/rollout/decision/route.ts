import { connectDB } from '@/lib/server/db';
import { MigrationStrategy } from '@/lib/server/models/MigrationStrategy';
import { resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

/** `?projectId=`. The sign-off, or `null` when there is no strategy yet. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const doc = await MigrationStrategy.findOne({ projectId: resolved.project.id }).lean();
		return Response.json({ decision: doc ? { locked: doc.locked } : null });
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId, decision: { locked } }`. Signs the strategy off, or withdraws the sign-off. */
export async function PUT(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; decision?: { locked?: unknown } } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const locked = body?.decision?.locked;
	if (typeof locked !== 'boolean') {
		return Response.json({ error: 'Expected { decision: { locked: boolean } }.' }, { status: 400 });
	}
	try {
		await connectDB();
		const result = await MigrationStrategy.updateOne({ projectId: resolved.project.id }, { $set: { locked, lockedAt: locked ? new Date() : null } });
		if (result.matchedCount === 0) {
			return Response.json({ error: 'Plan the rollout before signing it off.' }, { status: 409 });
		}
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

/** `?projectId=`. Withdraws the sign-off; the strategy stays. */
export async function DELETE(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		await MigrationStrategy.updateOne({ projectId: resolved.project.id }, { $set: { locked: false, lockedAt: null } });
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

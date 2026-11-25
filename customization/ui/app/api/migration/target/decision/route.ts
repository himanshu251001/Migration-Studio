import { connectDB } from '@/lib/server/db';
import { TargetMapping } from '@/lib/server/models/TargetMapping';
import { resetRollout } from '@/lib/server/phaseReset';
import { resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

/** `?projectId=`. The approved mappings, or `null` when nothing was mapped. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const doc = await TargetMapping.findOne({ projectId: resolved.project.id }).lean();
		return Response.json({ decision: doc ? { approved: doc.approved } : null });
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId, decision: { approved } }`. Saves the approved mapping ids; an approval that is withdrawn clears the Rollout built on the full set. */
export async function PUT(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; decision?: { approved?: unknown } } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const approved = body?.decision?.approved;
	if (!Array.isArray(approved) || approved.some(id => typeof id !== 'string')) {
		return Response.json({ error: 'Expected { decision: { approved: string[] } }.' }, { status: 400 });
	}
	try {
		await connectDB();
		const doc = await TargetMapping.findOne({ projectId: resolved.project.id });
		if (!doc) {
			return Response.json({ error: 'Map the technology before approving mappings.' }, { status: 409 });
		}
		const known = new Set<string>(doc.entries.map(entry => entry.category));
		if (!approved.every(id => known.has(id))) {
			return Response.json({ error: 'Unknown mapping.' }, { status: 400 });
		}
		const next = [...new Set(approved as string[])];
		const lost = doc.approved.some(id => !next.includes(id));
		doc.approved = next;
		await doc.save();
		if (lost) {
			await resetRollout(resolved.project);
		}
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

/** `?projectId=`. Forgets the approvals and the Rollout built on them. */
export async function DELETE(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		await TargetMapping.updateOne({ projectId: resolved.project.id }, { $set: { approved: [] } });
		await resetRollout(resolved.project);
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

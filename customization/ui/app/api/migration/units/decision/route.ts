import type { UnitsDecision } from '@/features/migration/units';
import { connectDB } from '@/lib/server/db';
import { MigrationUnit } from '@/lib/server/models/MigrationUnit';
import { resetDependencies } from '@/lib/server/phaseReset';
import { resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

/** `?projectId=`. The reviewer's unit order and lock, or `null` when there are no units. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const units = await MigrationUnit.find({ projectId: resolved.project.id }).sort({ order: 1 }).lean();
		const decision: UnitsDecision | null = units.length === 0 ? null : { order: units.map(u => u.unitId), locked: units.every(u => u.locked) };
		return Response.json({ decision });
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId, decision: { order, locked } }`. `order` must list every unit id exactly once. */
export async function PUT(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; decision?: { order?: unknown; locked?: unknown } } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const order = body?.decision?.order;
	const locked = body?.decision?.locked;
	if (!Array.isArray(order) || order.some(id => typeof id !== 'string') || typeof locked !== 'boolean') {
		return Response.json({ error: 'Expected { decision: { order: string[], locked: boolean } }.' }, { status: 400 });
	}
	const { project } = resolved;
	try {
		await connectDB();
		const units = await MigrationUnit.find({ projectId: project.id }).select({ unitId: 1 }).lean();
		const ids = new Set(units.map(u => u.unitId));
		if (units.length === 0) {
			return Response.json({ error: 'Group the units before ordering them.' }, { status: 409 });
		}
		if (order.length !== ids.size || new Set(order).size !== ids.size || !order.every(id => ids.has(id))) {
			return Response.json({ error: 'The order must list every unit exactly once.' }, { status: 400 });
		}
		const wasLocked = (await MigrationUnit.countDocuments({ projectId: project.id, locked: true })) === units.length;
		await MigrationUnit.bulkWrite((order as string[]).map((unitId, index) => ({ updateOne: { filter: { projectId: project.id, unitId }, update: { $set: { order: index, locked } } } })));
		// Unlocking is a change of mind about the catalog, so what was traced on it is stale.
		if (wasLocked && !locked) {
			await resetDependencies(project);
		}
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

/** `?projectId=`. Forgets the order and lock (back to the planner's order) and the dependency analysis built on them. */
export async function DELETE(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const units = await MigrationUnit.find({ projectId: resolved.project.id }).select({ plannerOrder: 1 }).lean();
		await MigrationUnit.bulkWrite(units.map(unit => ({ updateOne: { filter: { _id: unit._id }, update: { $set: { order: unit.plannerOrder, locked: false } } } })));
		await resetDependencies(resolved.project);
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

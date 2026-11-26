import { adaptMilestonesDecision } from '@/lib/server/adapters/milestones';
import { connectDB } from '@/lib/server/db';
import { buildMilestonesMarkdown } from '@/lib/server/milestones';
import { Milestone } from '@/lib/server/models/Milestone';
import { resetStories } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { milestoneName } from '@/lib/server/storyPipeline';
import { resolveStepProject, runRouteError } from '@/lib/server/stepRoute';
import type { Project } from '@/features/migration/types';

export const dynamic = 'force-dynamic';

const MAX_NAME_LENGTH = 200;

/** Rewrites the plan file so it carries the reviewer's names and the lock. */
async function writePlanFile(project: Project): Promise<void> {
	const docs = await Milestone.find({ projectId: project.id }).sort({ milestoneId: 1 }).lean();
	await writeProjectFile(project.dest, 'migration/milestones.md', buildMilestonesMarkdown(docs.map(m => ({ milestoneId: m.milestoneId, wave: m.wave, name: milestoneName(m), description: m.description, unitRefs: m.unitRefs, dependencies: m.dependencies, estimatedEffort: m.estimatedEffort, locked: m.locked }))));
}

/** `?projectId=`. The reviewer's renames and lock, or `null` when there is no plan. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		return Response.json({ decision: adaptMilestonesDecision(await Milestone.find({ projectId: resolved.project.id }).lean()) });
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId, decision: { names, locked } }`. Renames are ignored while the plan stays locked; unlocking clears the stories. */
export async function PUT(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; decision?: { names?: unknown; locked?: unknown } } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const names = body?.decision?.names;
	const locked = body?.decision?.locked;
	if (typeof names !== 'object' || names === null || Array.isArray(names) || typeof locked !== 'boolean' || Object.values(names).some(n => typeof n !== 'string' || n.length > MAX_NAME_LENGTH)) {
		return Response.json({ error: `Expected { decision: { names: Record<string, string>, locked: boolean } } with names up to ${MAX_NAME_LENGTH} characters.` }, { status: 400 });
	}
	const { project } = resolved;
	try {
		await connectDB();
		const docs = await Milestone.find({ projectId: project.id }).lean();
		if (docs.length === 0) {
			return Response.json({ error: 'Plan the milestones before locking them.' }, { status: 409 });
		}
		const wasLocked = docs.every(m => m.locked);
		if (wasLocked && locked) {
			return Response.json({ ok: true });
		}
		const renames = names as Record<string, string>;
		await Milestone.bulkWrite(docs.map(m => ({ updateOne: { filter: { _id: m._id }, update: { $set: { renamedTo: renames[m.milestoneId]?.trim() || null, locked } } } })));
		// Unlocking is a change of mind about the plan, so the stories written on it are stale.
		if (wasLocked && !locked) {
			await resetStories(project);
		}
		await writePlanFile(project);
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

/** `?projectId=`. Forgets the renames and the lock (back to the drafted plan) and the stories built on it; the deep analyses stay. */
export async function DELETE(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		await Milestone.updateMany({ projectId: resolved.project.id }, { $set: { renamedTo: null, locked: false } });
		await resetStories(resolved.project);
		if (await Milestone.exists({ projectId: resolved.project.id })) {
			await writePlanFile(resolved.project);
		}
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

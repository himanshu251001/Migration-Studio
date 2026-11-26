import type { Project } from '@/features/migration/types';
import { connectDB } from './db';
import { Run } from './models/Run';
import { findProject } from './projectStore';
import { isSameOrigin } from './sameOrigin';

export { runRouteError } from './runRoute';

/** Same-origin check, then resolves `projectId` to a stored project. The server never trusts client-supplied folders. */
export async function resolveStepProject(request: Request, projectId: unknown): Promise<{ project: Project } | { response: Response }> {
	if (!isSameOrigin(request)) {
		return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
	}
	if (typeof projectId !== 'string' || !projectId.trim()) {
		return { response: Response.json({ error: 'A projectId is required.' }, { status: 400 }) };
	}
	const project = await findProject(projectId);
	if (!project) {
		return { response: Response.json({ error: 'Project not found.' }, { status: 404 }) };
	}
	return { project };
}

/** A 409 response when a run of this phase is already going for the project, so double clicks cannot double the cost. */
export async function rejectIfRunning(projectId: string, phase: string): Promise<Response | undefined> {
	await connectDB();
	if (await Run.exists({ projectId, phase, status: 'running' })) {
		return Response.json({ error: 'This step is already running.' }, { status: 409 });
	}
	return undefined;
}

/** Like {@link rejectIfRunning}, but for every phase starting with `prefix` (a step and its sub-runs share one stored plan, so they must not overlap). */
export async function rejectIfAnyRunning(projectId: string, prefix: string): Promise<Response | undefined> {
	await connectDB();
	if (await Run.exists({ projectId, phase: { $regex: `^${prefix}(:|$)` }, status: 'running' })) {
		return Response.json({ error: 'This step is already running.' }, { status: 409 });
	}
	return undefined;
}

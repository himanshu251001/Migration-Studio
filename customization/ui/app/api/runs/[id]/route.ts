import type { RunInfo } from '@/features/migration/runs';
import { connectDB } from '@/lib/server/db';
import { Run } from '@/lib/server/models/Run';
import { guardRunRequest, runRouteError } from '@/lib/server/runRoute';

export const dynamic = 'force-dynamic';

/** Returns one run with its stored event log. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	const { id } = await params;
	const rejected = guardRunRequest(request, id);
	if (rejected) {
		return rejected;
	}
	try {
		await connectDB();
		const run = await Run.findById(id).lean();
		if (!run) {
			return Response.json({ error: 'Run not found.' }, { status: 404 });
		}
		const info: RunInfo = {
			id,
			projectId: run.projectId,
			phase: run.phase,
			status: run.status,
			events: run.events.map(event => ({ type: event.type, message: event.message, timestamp: event.timestamp.toISOString(), ...(event.progress === undefined ? {} : { progress: event.progress }) })),
			startedAt: run.createdAt.toISOString(),
			completedAt: run.completedAt?.toISOString() ?? null
		};
		return Response.json({ run: info });
	} catch (error) {
		return runRouteError(error);
	}
}

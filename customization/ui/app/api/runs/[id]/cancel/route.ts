import { cancelRun } from '@/lib/server/activeRuns';
import { connectDB } from '@/lib/server/db';
import { Run } from '@/lib/server/models/Run';
import { markCancelled } from '@/lib/server/runner';
import { guardRunRequest, runRouteError } from '@/lib/server/runRoute';

export const dynamic = 'force-dynamic';

/** Stops a running run: kills its CLI process, or closes it directly when nothing in this process tracks it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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
		if (run.status !== 'running') {
			return Response.json({ error: 'The run is not running.' }, { status: 400 });
		}
		if (!cancelRun(id)) {
			await markCancelled(id);
		}
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

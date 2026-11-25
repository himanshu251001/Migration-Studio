import { capabilityId } from '@/lib/server/adapters/componentIndex';
import { connectDB } from '@/lib/server/db';
import { Capability } from '@/lib/server/models/Capability';
import { resetDeepAnalyses } from '@/lib/server/phaseReset';
import { resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

/** `?projectId=`. Ids of the capabilities whose deep analysis has been generated. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const analyzed = await Capability.find({ projectId: resolved.project.id, deepAnalysisGeneratedAt: { $ne: null } }).select({ seqNum: 1 }).sort({ seqNum: 1 }).lean();
		return Response.json({ ids: analyzed.map(c => capabilityId(c.seqNum)) });
	} catch (error) {
		return runRouteError(error);
	}
}

/** `?projectId=`. Forgets every generated deep analysis (and its files); the capabilities themselves stay. */
export async function DELETE(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		await resetDeepAnalyses(resolved.project);
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

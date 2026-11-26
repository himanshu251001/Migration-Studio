import { connectDB } from '@/lib/server/db';
import { resolveLegacyRefByTarget } from '@/lib/server/legacyRefs';
import { analyzeMilestoneDeeply, buildMilestoneDeepAnalysisMarkdown, milestoneAnalysisFile } from '@/lib/server/milestones';
import { Milestone } from '@/lib/server/models/Milestone';
import { resetMilestoneAnalysis } from '@/lib/server/phaseReset';
import { requireLockedScope } from '@/lib/server/planningContext';
import { resolveInsideRoot, writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';
import { milestoneName } from '@/lib/server/storyPipeline';

export const dynamic = 'force-dynamic';

/** Body `{ projectId, milestoneId }`. Explores the source read-only and writes one milestone's deep analysis in a run. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; milestoneId?: unknown } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	const milestoneId = body?.milestoneId;
	if (typeof milestoneId !== 'string' || !/^M-\d{2,6}$/.test(milestoneId)) {
		return Response.json({ error: 'A valid milestoneId is required.' }, { status: 400 });
	}
	const phase = `milestone-analysis:${milestoneId}`;
	try {
		await connectDB();
		const milestone = await Milestone.findOne({ projectId: project.id, milestoneId }).lean();
		if (!milestone) {
			return Response.json({ error: 'Milestone not found.' }, { status: 404 });
		}
		const busy = await rejectIfRunning(project.id, phase);
		if (busy) {
			return busy;
		}
		const runId = await startRun({
			phase,
			projectId: project.id,
			exec: async ({ runId: id, signal, log, onProcessStart }) => {
				const scope = await requireLockedScope(project.id);
				const refs = await resolveLegacyRefByTarget(project.id);
				// The folder comes from the stored analysis, never from the model or the client.
				const ref = milestone.unitRefs.map(name => refs[name]).find((r): r is string => !!r);
				if (!ref) {
					throw new StepPrerequisiteError('Run the analysis first: no sub-project has been analyzed yet.');
				}
				const absolutePath = await resolveInsideRoot(project.source, ref === '.' ? '' : ref);
				// A re-run starts from nothing: the old analysis, its file and its old runs go before the new exploration begins.
				await resetMilestoneAnalysis(project, milestoneId, id);
				const name = milestoneName(milestone);
				await log('plan', `Exploring "${name}" in ${ref} with Claude (read-only).`, 0.05);
				let steps = 0;
				const analysis = await analyzeMilestoneDeeply({
					absolutePath, milestoneName: name, targetNames: milestone.unitRefs, stack: scope.stack, signal, onProcessStart,
					onEvent: (type, message) => {
						steps++;
						void log(type, message, 0.05 + 0.85 * (1 - 1 / (1 + steps / 15)));
					}
				});
				const file = milestoneAnalysisFile(milestoneId);
				await writeProjectFile(project.dest, file, buildMilestoneDeepAnalysisMarkdown(milestoneId, name, analysis));
				await Milestone.updateOne({ projectId: project.id, milestoneId }, { $set: { deepAnalysis: analysis, deepAnalysisGeneratedAt: new Date() } });
				await log('progress', `Deep analysis written to ${file}.`, 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

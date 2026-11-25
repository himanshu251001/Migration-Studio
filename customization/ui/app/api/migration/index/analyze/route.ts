import { capabilityId, seqNumOf } from '@/lib/server/adapters/componentIndex';
import { analyzeCapabilityDeeply, buildDeepAnalysisMarkdown, deepAnalysisFile } from '@/lib/server/capabilities';
import { connectDB } from '@/lib/server/db';
import { requireLockedStrategy } from '@/lib/server/lockedStrategy';
import { Capability } from '@/lib/server/models/Capability';
import { SubProjectAnalysis } from '@/lib/server/models/SubProjectAnalysis';
import { resetDeepAnalysis } from '@/lib/server/phaseReset';
import { resolveInsideRoot, writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';

export const dynamic = 'force-dynamic';

/** Body `{ projectId, capabilityId }`. Explores the source read-only and writes one capability's deep analysis in a run. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; capabilityId?: unknown } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	const seqNum = typeof body?.capabilityId === 'string' ? seqNumOf(body.capabilityId) : undefined;
	if (seqNum === undefined) {
		return Response.json({ error: 'A valid capabilityId is required.' }, { status: 400 });
	}
	const phase = `capability-analysis:${capabilityId(seqNum)}`;
	try {
		await connectDB();
		const capability = await Capability.findOne({ projectId: project.id, seqNum }).lean();
		if (!capability) {
			return Response.json({ error: 'Capability not found.' }, { status: 404 });
		}
		const busy = await rejectIfRunning(project.id, phase);
		if (busy) {
			return busy;
		}
		const runId = await startRun({
			phase,
			projectId: project.id,
			exec: async ({ runId: id, signal, log, onProcessStart }) => {
				const strategy = await requireLockedStrategy(project.id);
				const analyses = await SubProjectAnalysis.find({ projectId: project.id }).sort({ subProjectPath: 1 }).lean();
				// Claude names the sub-project; only one the analysis really found is used, so the folder cannot be chosen by the model.
				const owner = analyses.find(a => capability.primaryProjects.includes(a.subProjectPath)) ?? analyses[0];
				if (!owner) {
					throw new StepPrerequisiteError('Run the analysis first: no sub-project has been analyzed yet.');
				}
				const absolutePath = await resolveInsideRoot(project.source, owner.subProjectPath === '.' ? '' : owner.subProjectPath);
				// A re-run starts from nothing: the old analysis, its file and its old runs go before the new exploration begins.
				await resetDeepAnalysis(project, capability, id);
				await log('plan', `Exploring "${capability.name}" in ${owner.subProjectPath} with Claude (read-only).`, 0.05);
				let steps = 0;
				const analysis = await analyzeCapabilityDeeply({
					absolutePath, signal, onProcessStart,
					input: { name: capability.name, description: capability.description, domain: capability.domain, dependencies: capability.dependencies, strategyName: strategy.name, strategyRationale: strategy.report.executiveSummary.rationale },
					onEvent: (type, message) => {
						steps++;
						void log(type, message, 0.05 + 0.85 * (1 - 1 / (1 + steps / 15)));
					}
				});
				const file = deepAnalysisFile(seqNum, capability.name);
				await writeProjectFile(project.dest, file, buildDeepAnalysisMarkdown(seqNum, capability.name, capability.domain, analysis));
				await Capability.updateOne({ projectId: project.id, seqNum }, { $set: { deepAnalysis: analysis, deepAnalysisGeneratedAt: new Date() } });
				await log('progress', `Deep analysis written to ${file}.`, 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

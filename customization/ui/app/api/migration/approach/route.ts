import { adaptApproach } from '@/lib/server/adapters/approach';
import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { connectDB } from '@/lib/server/db';
import { buildReportMarkdown, evaluateStrategies } from '@/lib/server/decompositionStrategy';
import { DecompositionStrategyReport } from '@/lib/server/models/DecompositionStrategyReport';
import { SubProjectAnalysis } from '@/lib/server/models/SubProjectAnalysis';
import { resetApproach } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

const PHASE = 'approach';

/** `?projectId=`. The stored evaluation in the Approach step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const stored = await DecompositionStrategyReport.findOne({ projectId: resolved.project.id }).lean();
		return Response.json(adaptApproach(stored?.report, await lastRunInfo(resolved.project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId }`. Evaluates the strategies in a run; needs at least one analyzed sub-project. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	try {
		const busy = await rejectIfRunning(project.id, PHASE);
		if (busy) {
			return busy;
		}
		const runId = await startRun({
			phase: PHASE,
			projectId: project.id,
			exec: async ({ runId: id, signal, log, onProcessStart }) => {
				const analyses = await SubProjectAnalysis.find({ projectId: project.id }).sort({ subProjectPath: 1 }).lean();
				if (analyses.length === 0) {
					throw new StepPrerequisiteError('Run the analysis first: no sub-project has been analyzed yet.');
				}
				await resetApproach(project, id);
				await log('progress', `Loaded ${analyses.length} sub-project analysis result(s).`, 0.1);
				await log('plan', 'Evaluating the decomposition strategies against the evidence.', 0.2);
				const report = await evaluateStrategies(analyses.map(a => ({ subProjectPath: a.subProjectPath, dimensions: a.dimensions })), signal, onProcessStart);
				// A fresh evaluation replaces the report and with it any lock on the old one.
				await DecompositionStrategyReport.updateOne(
					{ projectId: project.id },
					{ $set: { report, runId: id, lockedOptionId: null, lockedCustom: null, lockedAt: null } },
					{ upsert: true }
				);
				await log('progress', `Recommended strategy: ${report.executiveSummary.recommendedStrategy}`, 0.9);
				await writeProjectFile(project.dest, 'migration/modernization-decomposition-report.md', buildReportMarkdown(report, analyses.length));
				await log('progress', 'Wrote the strategy report.', 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

import { adaptIndex } from '@/lib/server/adapters/componentIndex';
import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { buildCapabilityIndexMarkdown, deriveCapabilities } from '@/lib/server/capabilities';
import { connectDB } from '@/lib/server/db';
import { requireLockedStrategy } from '@/lib/server/lockedStrategy';
import { Capability } from '@/lib/server/models/Capability';
import { SubProjectAnalysis } from '@/lib/server/models/SubProjectAnalysis';
import { resetIndex } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

const PHASE = 'index';

/** `?projectId=`. The stored capability index in the Index step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	try {
		await connectDB();
		const capabilities = await Capability.find({ projectId: project.id }).sort({ seqNum: 1 }).lean();
		let strategyName = '';
		if (capabilities.length > 0) {
			strategyName = (await requireLockedStrategy(project.id).catch(() => undefined))?.name ?? '';
		}
		const analyses = capabilities.length > 0 ? await SubProjectAnalysis.find({ projectId: project.id }).lean() : [];
		const used = new Set(capabilities.flatMap(c => c.primaryProjects));
		const filesLinked = analyses.filter(a => used.has(a.subProjectPath)).reduce((sum, a) => sum + a.filesScanned, 0);
		return Response.json(adaptIndex(capabilities, strategyName, filesLinked, await lastRunInfo(project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId }`. Derives the capability index in a run; needs a locked strategy and the analyses it was built on. */
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
				const strategy = await requireLockedStrategy(project.id);
				const analyses = await SubProjectAnalysis.find({ projectId: project.id }).sort({ subProjectPath: 1 }).lean();
				if (analyses.length === 0) {
					throw new StepPrerequisiteError('Run the analysis first: no sub-project has been analyzed yet.');
				}
				// A rebuild starts from nothing: the old capabilities, their deep analyses and the Units built on them go first.
				await resetIndex(project, id);
				await log('progress', `Locked strategy: ${strategy.name}`, 0.1);
				await log('plan', `Deriving capabilities from ${analyses.length} sub-project analysis result(s).`, 0.2);
				const capabilities = await deriveCapabilities(analyses.map(a => ({ subProjectPath: a.subProjectPath, dimensions: a.dimensions })), strategy.name, signal, onProcessStart);
				await log('progress', `Derived ${capabilities.length} capabilities.`, 0.7);
				await Capability.insertMany(capabilities.map(c => ({ ...c, projectId: project.id, runId: id })));
				await log('progress', 'Grouped the capabilities by the locked strategy.', 0.85);
				await writeProjectFile(project.dest, 'migration/capability-index.md', buildCapabilityIndexMarkdown(capabilities, strategy.name));
				await log('progress', 'Wrote the capability index.', 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

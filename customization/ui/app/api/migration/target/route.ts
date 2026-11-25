import { adaptTarget } from '@/lib/server/adapters/target';
import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { ClaudeCliCancelledError } from '@/lib/server/claudeCli';
import { connectDB } from '@/lib/server/db';
import { buildMappingLibraryMarkdown, proposeMappingEntries, proposeMappingEntriesWithClaude, sourceStackName, type MappingSubProject } from '@/lib/server/mapping';
import { SubProjectAnalysis } from '@/lib/server/models/SubProjectAnalysis';
import { TargetMapping } from '@/lib/server/models/TargetMapping';
import { requireLockedScope } from '@/lib/server/planningContext';
import { resetTarget } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

const PHASE = 'target';

/** `?projectId=`. The stored mappings in the Target step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const doc = await TargetMapping.findOne({ projectId: resolved.project.id }).lean();
		return Response.json(adaptTarget(doc, await lastRunInfo(resolved.project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId }`. Maps the legacy patterns to the locked target stack in a run; needs the locked Scope decision. */
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
				const { stack } = await requireLockedScope(project.id);
				const analyses = await SubProjectAnalysis.find({ projectId: project.id }).sort({ subProjectPath: 1 }).lean();
				if (analyses.length === 0) {
					throw new StepPrerequisiteError('Run the analysis first: no sub-project has been analyzed yet.');
				}
				// A re-map starts from nothing: the old mappings and approvals, the Rollout built on them, and the file go first.
				await resetTarget(project, id);
				const source = sourceStackName(analyses.map(a => a.dimensions.framework));
				await log('progress', `Mapping ${source} to ${stack.name}.`, 0.1);
				const subProjects: MappingSubProject[] = analyses.map(({ subProjectPath, dimensions: d }) => ({
					subProjectPath, framework: d.framework,
					architecture: { modules: d.architecture.modules, interfaces: d.architecture.interfaces, integrations: d.architecture.integrations },
					data: { technologies: d.data.technologies }, dependencies: { upstream: d.dependencies.upstream, downstream: d.dependencies.downstream },
					users: { roles: d.users.roles, permissions: d.users.permissions }
				}));
				await log('plan', 'Asking Claude for one grounded mapping per legacy pattern category.', 0.2);
				let entries;
				let mappingSource: 'claude' | 'deterministic' = 'claude';
				try {
					entries = await proposeMappingEntriesWithClaude(source, subProjects, stack, signal, onProcessStart);
				} catch (error) {
					if (signal.aborted || error instanceof ClaudeCliCancelledError) {
						throw error;
					}
					// A failed draft must not fail the run, but it must not pass for Claude's either: the log and the result say so.
					await log('warning', "Claude's mapping failed; the deterministic mapping (no examples) was used instead.", 0.7);
					entries = proposeMappingEntries(source, stack);
					mappingSource = 'deterministic';
				}
				await log('progress', `Mapped ${entries.length} pattern categories.`, 0.85);
				await TargetMapping.create({ projectId: project.id, sourceStack: source, targetStackName: stack.name, entries, source: mappingSource, approved: [], runId: id });
				await writeProjectFile(project.dest, 'migration/pattern-mapping-library.md', buildMappingLibraryMarkdown(entries, source, stack.name));
				await log('progress', 'Wrote the mapping library.', 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

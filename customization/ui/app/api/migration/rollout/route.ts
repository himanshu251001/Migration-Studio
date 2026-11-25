import { adaptRollout } from '@/lib/server/adapters/rollout';
import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { ClaudeCliCancelledError } from '@/lib/server/claudeCli';
import { connectDB } from '@/lib/server/db';
import { buildMigrationStrategy, buildMigrationStrategyMarkdown, buildMigrationStrategyWithClaude, type StrategyInput } from '@/lib/server/migrationStrategy';
import { MigrationStrategy } from '@/lib/server/models/MigrationStrategy';
import { SubProjectAnalysis } from '@/lib/server/models/SubProjectAnalysis';
import { TargetMapping } from '@/lib/server/models/TargetMapping';
import { requireDependencyContext, requireLockedScope } from '@/lib/server/planningContext';
import { resetRollout } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';
import { keepsExistingDatabase } from '@/lib/server/targetCatalog';

export const dynamic = 'force-dynamic';

const PHASE = 'rollout';

/** `?projectId=`. The stored strategy in the Rollout step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const doc = await MigrationStrategy.findOne({ projectId: resolved.project.id }).lean();
		return Response.json(adaptRollout(doc, await lastRunInfo(resolved.project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId }`. Plans the rollout in a run; needs the locked Scope decision and every mapping approved. */
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
				const scope = await requireLockedScope(project.id);
				const mapping = await TargetMapping.findOne({ projectId: project.id }).lean();
				if (!mapping || mapping.entries.length === 0 || mapping.approved.length < mapping.entries.length) {
					throw new StepPrerequisiteError('Approve every mapping in the Target step first.');
				}
				const context = await requireDependencyContext(project.id);
				const analyses = await SubProjectAnalysis.find({ projectId: project.id }).sort({ subProjectPath: 1 }).lean();
				// A re-plan starts from nothing: the old strategy and its sign-off, old runs and the file go first.
				await resetRollout(project, id);
				await log('progress', `Planning the rollout to ${scope.stack.name} for ${context.units.length} unit(s).`, 0.1);
				const input: StrategyInput = {
					targetStack: scope.stack, architectureOption: scope.architecture, database: scope.database, keepsDatabase: keepsExistingDatabase(scope.database), rolloutStrategy: scope.strategy,
					units: context.units.map(u => ({ name: u.name, wave: u.wave })), sharedServices: context.sharedServices.map(s => ({ name: s.name, wave: s.wave })),
					capabilities: context.capabilities, subProjects: analyses.map(a => ({ subProjectPath: a.subProjectPath, framework: a.dimensions.framework }))
				};
				await log('plan', 'Asking Claude to write the migration strategy.', 0.2);
				let strategy;
				let source: 'claude' | 'deterministic' = 'claude';
				try {
					strategy = await buildMigrationStrategyWithClaude(input, signal, onProcessStart);
				} catch (error) {
					if (signal.aborted || error instanceof ClaudeCliCancelledError) {
						throw error;
					}
					// A failed draft must not fail the run, but it must not pass for Claude's either: the log and the result say so.
					await log('warning', "Claude's strategy draft failed; the deterministic strategy was used instead.", 0.75);
					strategy = buildMigrationStrategy(input);
					source = 'deterministic';
				}
				await log('progress', `Strategy drafted: ${strategy.apiStrategyByWave.length} wave(s), ${strategy.architecturalDecisions.length} decision(s).`, 0.85);
				await MigrationStrategy.create({ projectId: project.id, strategy, source, targetStackName: scope.stack.name, architectureOption: scope.architecture, unitCount: context.units.length, locked: false, runId: id });
				await writeProjectFile(project.dest, 'migration/migration-strategy.md', buildMigrationStrategyMarkdown(strategy, scope.stack.name, scope.architecture));
				await log('progress', 'Wrote the migration strategy.', 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

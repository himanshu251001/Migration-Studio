import { adaptMilestones } from '@/lib/server/adapters/milestones';
import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { ClaudeCliCancelledError } from '@/lib/server/claudeCli';
import { connectDB } from '@/lib/server/db';
import { buildMilestones, buildMilestonesMarkdown, buildMilestonesWithClaude, type MilestoneSources, type WaveTarget } from '@/lib/server/milestones';
import { Milestone } from '@/lib/server/models/Milestone';
import { MigrationStrategy } from '@/lib/server/models/MigrationStrategy';
import { resetMilestones } from '@/lib/server/phaseReset';
import { requireDependencyContext, requireLockedScope } from '@/lib/server/planningContext';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

const PHASE = 'milestones';

/** `?projectId=`. The stored plan in the Milestones step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const docs = await Milestone.find({ projectId: resolved.project.id }).lean();
		return Response.json(adaptMilestones(docs, await lastRunInfo(resolved.project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId }`. Drafts the milestone plan in a run; needs the locked Scope decision and the dependency waves. */
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
				const context = await requireDependencyContext(project.id);
				const targets: WaveTarget[] = [
					...context.units.flatMap(u => typeof u.wave === 'number' ? [{ name: u.name, type: 'migration-unit' as const, wave: u.wave }] : []),
					...context.sharedServices.flatMap(s => typeof s.wave === 'number' ? [{ name: s.name, type: 'shared-service' as const, wave: s.wave }] : [])
				];
				if (targets.length === 0) {
					throw new StepPrerequisiteError('Run the dependency analysis first: no unit has an execution wave.');
				}
				const strategy = await MigrationStrategy.findOne({ projectId: project.id }).lean();
				// A re-plan starts from nothing: the old plan, its renames, lock, deep analyses, the stories on it, old runs and files go first.
				await resetMilestones(project, id);
				const skipped = context.units.length + context.sharedServices.length - targets.length;
				if (skipped > 0) {
					await log('warning', `${skipped} unit(s) or service(s) sit in a dependency cycle and have no wave; they are not in any milestone.`, 0.05);
				}
				await log('progress', `Sequencing ${targets.length} unit(s) and service(s) for ${scope.stack.name}.`, 0.1);
				const gaps = scope.doc.gaps;
				const sources: MilestoneSources = {
					units: context.units.map(u => ({ name: u.name, domain: u.domain, wave: u.wave, scope: u.scopeEstimate, capabilities: u.capabilities.map(c => c.name), dependsOn: u.upstreamDependencies.map(d => d.name), blockers: u.migrationBlockers.map(b => b.blocker), readiness: u.readinessScore })),
					sharedServices: context.sharedServices.map(s => ({ name: s.name, wave: s.wave, dependentCount: s.dependentCount, blockers: s.migrationBlockers.map(b => b.blocker) })),
					strategy: strategy ? { executiveSummary: strategy.strategy.executiveSummary, apiStrategyByWave: strategy.strategy.apiStrategyByWave } : null,
					charter: { goals: scope.doc.charter.goals.map(g => ({ name: g.name, successIndicator: g.successIndicator })), constraints: scope.doc.charter.constraints.map(c => ({ category: c.category, constraint: c.constraint })) },
					gaps: { total: gaps.length, largeEffort: gaps.filter(g => g.effort === 'Large').length, highFunctionalRisk: gaps.filter(g => g.functionalParityRisk === 'High').length }
				};
				await log('plan', 'Asking Claude to draft the milestones.', 0.2);
				let milestones;
				let source: 'claude' | 'deterministic' = 'claude';
				try {
					milestones = await buildMilestonesWithClaude(sources, targets, signal, onProcessStart);
				} catch (error) {
					if (signal.aborted || error instanceof ClaudeCliCancelledError) {
						throw error;
					}
					// A failed plan must not fail the run, but it must not pass for Claude's either: the log and the result say so.
					await log('warning', "Claude's milestone plan failed validation; one milestone per wave was used instead.", 0.7);
					milestones = buildMilestones(targets);
					source = 'deterministic';
				}
				await log('progress', `Milestones drafted: ${milestones.length}.`, 0.85);
				await Milestone.insertMany(milestones.map(m => ({ ...m, projectId: project.id, source, renamedTo: null, locked: false, deepAnalysis: null, deepAnalysisGeneratedAt: null, runId: id })));
				await writeProjectFile(project.dest, 'migration/milestones.md', buildMilestonesMarkdown(milestones.map(m => ({ ...m, locked: false }))));
				await log('progress', 'Wrote the milestone plan.', 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

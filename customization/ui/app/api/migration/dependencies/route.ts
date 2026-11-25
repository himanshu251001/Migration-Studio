import { adaptDependencies, storedTargets } from '@/lib/server/adapters/dependencies';
import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { ClaudeCliCancelledError } from '@/lib/server/claudeCli';
import { connectDB } from '@/lib/server/db';
import { assessReadiness, assignWaves, buildDependencyAnalysisMarkdown, heuristicReadiness, sequencingViolationsOf, type AnalysisTarget, type DependencyEdge, type Readiness } from '@/lib/server/dependencyAnalysis';
import { MigrationUnit } from '@/lib/server/models/MigrationUnit';
import { SharedService } from '@/lib/server/models/SharedService';
import { resetDependencies } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

const PHASE = 'dependencies';
/** How many readiness assessments run at once; each is a Claude process. */
const CONCURRENCY = 4;

/** `?projectId=`. The stored analysis in the Dependencies step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	try {
		await connectDB();
		const [units, sharedServices] = await Promise.all([MigrationUnit.find({ projectId: project.id }).lean(), SharedService.find({ projectId: project.id }).lean()]);
		return Response.json(adaptDependencies(storedTargets(units, sharedServices), await lastRunInfo(project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Runs `task` over `items`, at most `limit` at a time, stopping early when `signal` aborts. Results keep the input order. */
async function mapLimited<T, R>(items: readonly T[], limit: number, signal: AbortSignal, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length && !signal.aborted) {
			const index = next++;
			results[index] = await task(items[index], index);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

/** Body `{ projectId }`. Traces dependencies between the locked units in a run. */
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
				const units = await MigrationUnit.find({ projectId: project.id, locked: true }).sort({ order: 1 }).lean();
				if (units.length === 0) {
					throw new StepPrerequisiteError('Lock the migration units first: the dependencies are traced on a locked catalog.');
				}
				const sharedServices = await SharedService.find({ projectId: project.id }).sort({ seqNum: 1 }).lean();
				// A re-run starts from nothing: the old results on the units and services, old runs and the file go first.
				await resetDependencies(project, id);
				await log('progress', `Tracing dependencies of ${units.length} unit(s) and ${sharedServices.length} shared service(s).`, 0.05);
				const inputs = units.map(unit => ({
					unit,
					upstream: [
						...unit.sharedServicesConsumed.map((name): DependencyEdge => ({ name, reason: 'Consumes this shared platform service at runtime.', isHardBlocker: true })),
						...unit.dependenciesOnOtherUnits.map((d): DependencyEdge => ({ name: d.unitName, reason: d.reason, isHardBlocker: true }))
					]
				}));
				await log('progress', `Found ${inputs.reduce((sum, i) => sum + i.upstream.length, 0)} upstream dependency edge(s).`, 0.1);
				let assessed = 0;
				const readiness = await mapLimited(inputs, CONCURRENCY, signal, async ({ unit, upstream }): Promise<{ result: Readiness; source: 'claude' | 'heuristic' }> => {
					await log('tool_call', `Asking Claude to assess the readiness of "${unit.name}" (${upstream.length} upstream).`);
					try {
						const result = await assessReadiness(unit.name, unit.capabilities.map(c => c.name), upstream, signal, onProcessStart);
						await log('result', `"${unit.name}": ${result.readinessScore}`, 0.1 + 0.75 * (++assessed / inputs.length));
						return { result, source: 'claude' };
					} catch (error) {
						if (signal.aborted || error instanceof ClaudeCliCancelledError) {
							throw error;
						}
						// A failed assessment must not fail the run, but it must not pass for Claude's either: the log and result say so.
						await log('warning', `Claude's assessment of "${unit.name}" failed; the deterministic rule was used instead.`, 0.1 + 0.75 * (++assessed / inputs.length));
						return { result: heuristicReadiness(upstream), source: 'heuristic' };
					}
				});
				if (signal.aborted) {
					return;
				}
				const targets: AnalysisTarget[] = [
					...sharedServices.map((service): AnalysisTarget => ({
						name: service.name, type: 'shared-service', upstreamDependencies: [], downstreamDependents: [], migrationBlockers: [],
						readinessScore: 'High', readinessJustification: 'No upstream dependencies: extract early.', readinessSource: 'heuristic', wave: 0
					})),
					...inputs.map(({ unit, upstream }, index): AnalysisTarget => ({
						name: unit.name, type: 'migration-unit', upstreamDependencies: upstream, downstreamDependents: [],
						migrationBlockers: readiness[index].result.migrationBlockers, readinessScore: readiness[index].result.readinessScore,
						readinessJustification: readiness[index].result.readinessJustification, readinessSource: readiness[index].source, wave: 0
					}))
				];
				const cycles = assignWaves(targets);
				await log('progress', cycles.length === 0 ? 'No circular dependencies found.' : `Circular dependencies block: ${cycles[0].join(', ')}.`, 0.9);
				const byName = new Map(targets.map(target => [`${target.type}:${target.name}`, target]));
				const stored = ({ wave, readinessScore, readinessJustification, readinessSource, upstreamDependencies, downstreamDependents, migrationBlockers }: AnalysisTarget) => ({ wave, readinessScore, readinessJustification, readinessSource, upstreamDependencies, downstreamDependents, migrationBlockers });
				await MigrationUnit.bulkWrite(units.map(unit => ({ updateOne: { filter: { _id: unit._id }, update: { $set: stored(byName.get(`migration-unit:${unit.name}`)!) } } })));
				if (sharedServices.length > 0) {
					await SharedService.bulkWrite(sharedServices.map(service => ({ updateOne: { filter: { _id: service._id }, update: { $set: stored(byName.get(`shared-service:${service.name}`)!) } } })));
				}
				await writeProjectFile(project.dest, 'migration/dependency-analysis.md', buildDependencyAnalysisMarkdown(targets, cycles, sequencingViolationsOf(targets)));
				await log('progress', `Execution order fixed in ${new Set(targets.map(t => t.wave)).size} wave(s). Wrote the dependency analysis.`, 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

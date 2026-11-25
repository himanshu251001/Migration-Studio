import { adaptScope } from '@/lib/server/adapters/scope';
import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { buildCharter, buildCharterMarkdown, buildCharterWithClaude, type CharterInput } from '@/lib/server/charter';
import { ClaudeCliCancelledError } from '@/lib/server/claudeCli';
import { connectDB } from '@/lib/server/db';
import { requireLockedStrategy } from '@/lib/server/lockedStrategy';
import { ScopeCharter } from '@/lib/server/models/ScopeCharter';
import { SubProjectAnalysis } from '@/lib/server/models/SubProjectAnalysis';
import { requireDependencyContext } from '@/lib/server/planningContext';
import { resetScope } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';
import { DATABASE_OPTIONS, proposeStackCandidates, ROLLOUT_STRATEGIES } from '@/lib/server/targetCatalog';

export const dynamic = 'force-dynamic';

const PHASE = 'scope';

/** `?projectId=`. The stored scope in the Scope step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const doc = await ScopeCharter.findOne({ projectId: resolved.project.id }).lean();
		return Response.json(adaptScope(doc, await lastRunInfo(resolved.project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId }`. Drafts the charter and stack candidates in a run; needs the locked units and their dependency analysis. */
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
				const context = await requireDependencyContext(project.id);
				const analyses = await SubProjectAnalysis.find({ projectId: project.id }).sort({ subProjectPath: 1 }).lean();
				if (analyses.length === 0) {
					throw new StepPrerequisiteError('Run the analysis first: no sub-project has been analyzed yet.');
				}
				// A re-draft starts from nothing: the old charter, choices and lock, and the Target and Rollout built on them go first.
				await resetScope(project, id);
				await log('progress', `Loaded ${context.units.length} unit(s), ${context.sharedServices.length} shared service(s) and ${analyses.length} sub-project analysis result(s).`, 0.05);
				const proposals = proposeStackCandidates(analyses.map(a => a.dimensions.framework));
				await log('progress', `Proposed ${proposals.length} target stack candidate(s).`, 0.1);

				const { executiveSummary, modernizationBoundaries, risks } = strategy.report;
				const input: CharterInput = {
					units: context.units, sharedServices: context.sharedServices, boundaries: modernizationBoundaries,
					strategyRisks: risks.map(r => ({ risk: r.risk, category: r.category, severity: r.severity })),
					recommendedStrategy: strategy.name, strategyRationale: executiveSummary.rationale
				};
				await log('plan', 'Drafting the charter with Claude.', 0.2);
				let charter;
				let charterSource: 'claude' | 'deterministic' = 'claude';
				try {
					charter = await buildCharterWithClaude(input, signal, onProcessStart);
				} catch (error) {
					if (signal.aborted || error instanceof ClaudeCliCancelledError) {
						throw error;
					}
					// A failed draft must not fail the run, but it must not pass for Claude's either: the log and the result say so.
					await log('warning', "Claude's charter draft failed; the deterministic charter was used instead.", 0.8);
					charter = buildCharter(input);
					charterSource = 'deterministic';
				}
				await log('progress', `Charter drafted: ${charter.goals.length} goal(s), ${charter.scopeInScope.length} in-scope item(s).`, 0.85);

				await ScopeCharter.create({
					projectId: project.id, charter, charterSource,
					candidates: proposals.map(p => ({ id: p.id, name: p.stack.name, architecture: p.architecture, description: p.description, tradeoff: p.tradeoff })),
					// The gaps depend on the target, which the reviewer has not chosen yet: they are analyzed later, for the selection.
					gaps: [], gapSelection: null,
					stack: null, customStack: null, database: DATABASE_OPTIONS[0], strategy: ROLLOUT_STRATEGIES[0], resolutions: {}, locked: false, runId: id
				});
				await writeProjectFile(project.dest, 'migration/modernization-charter.md', buildCharterMarkdown(charter, undefined));
				await log('progress', 'Wrote the charter.', 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

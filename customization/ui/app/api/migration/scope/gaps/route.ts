import { connectDB } from '@/lib/server/db';
import { analyzeGaps } from '@/lib/server/gapAnalysis';
import { requireLockedStrategy } from '@/lib/server/lockedStrategy';
import { ScopeCharter } from '@/lib/server/models/ScopeCharter';
import { SubProjectAnalysis } from '@/lib/server/models/SubProjectAnalysis';
import { deleteScopeGapRuns } from '@/lib/server/phaseReset';
import { requireDependencyContext } from '@/lib/server/planningContext';
import { resolveInsideRoot } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';
import { customStackEntry, stackById } from '@/lib/server/targetCatalog';

export const dynamic = 'force-dynamic';

const PHASE = 'scope:gaps';

/**
 * Body `{ projectId }`. Finds the gaps for the stack, database and strategy the reviewer has selected (saved in the
 * scope decision) in a run. The result is tied to that selection: changing it discards the gaps and their resolutions.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	try {
		await connectDB();
		const busy = await rejectIfRunning(project.id, PHASE);
		if (busy) {
			return busy;
		}
		const runId = await startRun({
			phase: PHASE,
			projectId: project.id,
			exec: async ({ runId: id, signal, log, onProcessStart }) => {
				const doc = await ScopeCharter.findOne({ projectId: project.id });
				if (!doc) {
					throw new StepPrerequisiteError('Draft the scope first.');
				}
				if (doc.locked) {
					throw new StepPrerequisiteError('The target stack is locked. Unlock it before analyzing gaps again.');
				}
				const custom = doc.stack === 'other';
				const stack = custom ? (doc.customStack?.trim() ? customStackEntry(doc.customStack.trim()) : undefined) : stackById(doc.stack ?? '');
				if (!stack) {
					throw new StepPrerequisiteError('Select a target stack before analyzing gaps.');
				}
				const architecture = custom ? 'custom' : doc.candidates.find(c => c.id === doc.stack)?.architecture ?? 'custom';
				const strategy = await requireLockedStrategy(project.id);
				const context = await requireDependencyContext(project.id);
				const analyses = await SubProjectAnalysis.find({ projectId: project.id }).sort({ subProjectPath: 1 }).lean();
				if (analyses.length === 0) {
					throw new StepPrerequisiteError('Run the analysis first: no sub-project has been analyzed yet.');
				}
				// The selection the analysis is for. If the reviewer changes it while this runs, the result is dropped below.
				const selection = { stack: doc.stack!, customStack: custom ? doc.customStack!.trim() : null, database: doc.database, strategy: doc.strategy };
				// A re-analysis starts from nothing: the old gaps and their resolutions, and the old runs, go first.
				doc.gaps = [];
				doc.gapSelection = null;
				doc.resolutions = {};
				doc.markModified('gaps');
				doc.markModified('resolutions');
				await doc.save();
				await deleteScopeGapRuns(project.id, id);
				await log('plan', `Exploring the source against ${stack.name} with Claude (read-only) to find gaps.`, 0.05);
				const absolutePath = await resolveInsideRoot(project.source, '');
				let steps = 0;
				const gaps = await analyzeGaps({
					absolutePath, signal, onProcessStart,
					context: {
						sourceSubProjects: analyses.map(a => ({ subProjectPath: a.subProjectPath, framework: a.dimensions.framework })),
						migrationUnits: context.units.map(u => ({ name: u.name, domain: u.domain })),
						sharedServices: context.sharedServices.map(s => ({ name: s.name, reason: s.reason })),
						decompositionBoundaries: strategy.report.modernizationBoundaries.map(b => ({ name: b.name, description: b.description }))
					},
					stack, architectureOption: architecture, dbDecision: selection.database, strategy: selection.strategy,
					onEvent: (type, message) => {
						steps++;
						void log(type, message, 0.05 + 0.85 * (1 - 1 / (1 + steps / 15)));
					}
				});
				await log('progress', `Found ${gaps.length} gap(s).`, 0.95);
				// Keep the result only when the selection is still the one analyzed (it is compared on the stored document).
				const result = await ScopeCharter.updateOne(
					{ projectId: project.id, locked: false, stack: selection.stack, customStack: selection.customStack, database: selection.database, strategy: selection.strategy },
					{ $set: { gaps: gaps.map((gap, index) => ({ ...gap, gapId: `GAP-${String(index + 1).padStart(2, '0')}` })), gapSelection: selection, resolutions: {} } }
				);
				if (result.matchedCount === 0) {
					await log('warning', 'The selection changed while the gaps were being analyzed; the result was discarded. Analyze the gaps again.', 1);
					return;
				}
				await log('progress', 'Gap analysis ready for review.', 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

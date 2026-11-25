import { adaptUnits, unitsCatalogArtifact } from '@/lib/server/adapters/units';
import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { dimensionForStrategy } from '@/lib/server/capabilities';
import { connectDB } from '@/lib/server/db';
import { requireLockedStrategy } from '@/lib/server/lockedStrategy';
import { groupIntoMigrationUnits, identifySharedServices, refineMigrationUnits, unitIdAt } from '@/lib/server/migrationUnits';
import { Capability } from '@/lib/server/models/Capability';
import { MigrationUnit } from '@/lib/server/models/MigrationUnit';
import { MigrationUnitCatalog } from '@/lib/server/models/MigrationUnitCatalog';
import { SharedService } from '@/lib/server/models/SharedService';
import { resetUnits } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

const PHASE = 'units';

/** `?projectId=`. The stored units in the Units step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	try {
		await connectDB();
		const [units, sharedServices, catalog] = await Promise.all([
			MigrationUnit.find({ projectId: project.id }).sort({ plannerOrder: 1 }).lean(),
			SharedService.find({ projectId: project.id }).sort({ seqNum: 1 }).lean(),
			MigrationUnitCatalog.findOne({ projectId: project.id }).lean()
		]);
		return Response.json(adaptUnits(units, sharedServices, catalog, await lastRunInfo(project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId }`. Groups the capabilities into units in a run; needs the capability index. */
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
				const stored = await Capability.find({ projectId: project.id }).sort({ seqNum: 1 }).lean();
				if (stored.length === 0) {
					throw new StepPrerequisiteError('Build the component index first: there are no capabilities to group.');
				}
				const capabilities = stored.map(c => ({ seqNum: c.seqNum, domain: c.domain, name: c.name, description: c.description, businessOutcome: c.businessOutcome, personas: c.personas, frequency: c.frequency, criticality: c.criticality, primaryProjects: c.primaryProjects, dependencies: c.dependencies }));
				// A regroup starts from nothing: the old units, their order and lock, and the dependency analysis go first.
				await resetUnits(project, id);
				await log('progress', `Loaded ${capabilities.length} capabilities.`, 0.05);
				const shared = identifySharedServices(capabilities);
				await log('progress', `Identified ${shared.length} shared platform service(s).`, 0.15);
				const grouped = groupIntoMigrationUnits(capabilities, shared.map(s => s.name));
				await log('progress', `Clustered the capabilities into ${grouped.length} unit(s).`, 0.3);
				await log('plan', 'Checking unit cohesion against the locked strategy with Claude.', 0.35);
				const { evidence, executiveSummary, modernizationBoundaries } = strategy.report;
				const refinement = await refineMigrationUnits(grouped, capabilities, {
					recommendedStrategy: strategy.name, rationale: executiveSummary.rationale,
					businessBoundaries: evidence.businessBoundaries, tightlyCoupled: evidence.tightlyCoupled, modernizationBoundaries
				}, signal, onProcessStart);
				const rationaleByName = new Map(refinement.unitRationales.map(r => [r.name, r.scopeRationale]));
				for (const unit of grouped) {
					unit.scopeRationale = rationaleByName.get(unit.name)?.trim() || unit.scopeRationale;
				}
				await log('progress', `Cohesion check done: ${refinement.cohesionIssues.length} issue(s), ${refinement.deviations.length} deviation(s).`, 0.85);
				if (shared.length > 0) {
					await SharedService.insertMany(shared.map(s => ({ ...s, projectId: project.id, runId: id })));
				}
				await MigrationUnit.insertMany(grouped.map((u, index) => ({ ...u, projectId: project.id, unitId: unitIdAt(index), plannerOrder: index, order: index, locked: false, runId: id })));
				const grouping = new Set(grouped.flatMap(u => u.capabilities.map(c => c.name)));
				const sharedNames = new Set(shared.map(s => s.name));
				const catalog = {
					groupingLabel: dimensionForStrategy(strategy.name).groupingLabel,
					deviations: refinement.deviations,
					cohesionIssues: refinement.cohesionIssues,
					unanalyzedCapabilities: capabilities.filter(c => !grouping.has(c.name) && !sharedNames.has(c.name)).map(c => ({ seqNum: c.seqNum, name: c.name, domain: c.domain }))
				};
				await MigrationUnitCatalog.updateOne({ projectId: project.id }, { $set: catalog }, { upsert: true });
				const [units, services] = await Promise.all([MigrationUnit.find({ projectId: project.id }).lean(), SharedService.find({ projectId: project.id }).sort({ seqNum: 1 }).lean()]);
				await writeProjectFile(project.dest, 'migration/migration-units-catalog.md', unitsCatalogArtifact(units, services, catalog).markdown);
				await log('progress', 'Wrote the unit catalog.', 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

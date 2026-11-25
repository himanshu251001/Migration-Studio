import { connectDB } from './db';
import type { CharterSharedService, CharterUnit } from './charter';
import { Capability } from './models/Capability';
import { MigrationUnit } from './models/MigrationUnit';
import { ScopeCharter, type ScopeCharterDoc } from './models/ScopeCharter';
import { SharedService } from './models/SharedService';
import { StepPrerequisiteError } from './stepErrors';
import { customStackEntry, stackById, type TargetStackEntry } from './targetCatalog';

/** The locked units and shared services with their dependency analysis, and the capabilities. */
export interface DependencyContext {
	units: CharterUnit[];
	sharedServices: CharterSharedService[];
	capabilities: { name: string; domain: string }[];
}

/** The units, services and capabilities for the Scope step; throws a prerequisite error (fixed text) when the Dependencies step has not finished. */
export async function requireDependencyContext(projectId: string): Promise<DependencyContext> {
	await connectDB();
	const units = await MigrationUnit.find({ projectId, locked: true }).sort({ order: 1 }).lean();
	if (units.length === 0) {
		throw new StepPrerequisiteError('Lock the migration units first: the scope is drafted on a locked catalog.');
	}
	if (units.some(unit => unit.wave === null)) {
		throw new StepPrerequisiteError('Run the dependency analysis first: the scope needs the execution waves.');
	}
	const [sharedServices, capabilities] = await Promise.all([
		SharedService.find({ projectId }).sort({ seqNum: 1 }).lean(),
		Capability.find({ projectId }).sort({ seqNum: 1 }).select({ name: 1, domain: 1 }).lean()
	]);
	return {
		units: units.map(u => ({ name: u.name, domain: u.domain, capabilities: u.capabilities, sharedServicesConsumed: u.sharedServicesConsumed, dependenciesOnOtherUnits: u.dependenciesOnOtherUnits, scopeEstimate: u.scopeEstimate, scopeRationale: u.scopeRationale, readinessScore: u.readinessScore, readinessJustification: u.readinessJustification, wave: u.wave, upstreamDependencies: u.upstreamDependencies, migrationBlockers: u.migrationBlockers })),
		sharedServices: sharedServices.map(s => ({ name: s.name, dependentCount: s.dependentCount, reason: s.reason, readinessScore: s.readinessScore, readinessJustification: s.readinessJustification, wave: s.wave, migrationBlockers: s.migrationBlockers })),
		capabilities: capabilities.map(c => ({ name: c.name, domain: c.domain }))
	};
}

/** The stack, architecture, database and strategy the reviewer locked in the Scope step. */
export interface LockedScope {
	doc: ScopeCharterDoc;
	stack: TargetStackEntry;
	architecture: string;
	database: string;
	strategy: string;
}

/** The locked Scope decision; throws a prerequisite error (fixed text) when the target stack has not been locked. */
export async function requireLockedScope(projectId: string): Promise<LockedScope> {
	await connectDB();
	const doc = await ScopeCharter.findOne({ projectId }).lean();
	if (!doc?.locked) {
		throw new StepPrerequisiteError('Lock the target stack in the Scope step first.');
	}
	const custom = doc.stack === 'other';
	const stack = custom ? customStackEntry(doc.customStack?.trim() || 'Custom stack') : stackById(doc.stack ?? '');
	if (!stack) {
		throw new StepPrerequisiteError('Lock the target stack in the Scope step first.');
	}
	const architecture = custom ? 'custom' : doc.candidates.find(c => c.id === doc.stack)?.architecture ?? 'custom';
	return { doc, stack, architecture, database: doc.database, strategy: doc.strategy };
}

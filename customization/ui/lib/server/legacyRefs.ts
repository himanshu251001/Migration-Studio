import { connectDB } from './db';
import { Capability } from './models/Capability';
import { MigrationUnit } from './models/MigrationUnit';
import { SharedService } from './models/SharedService';
import { SubProjectAnalysis } from './models/SubProjectAnalysis';

/**
 * The sub-project each migration unit or shared service really lives in, found by tracing its capabilities back to the
 * sub-projects that implement them. A target with no trace falls back to the first analyzed sub-project; `null` only
 * when nothing was analyzed.
 */
export async function resolveLegacyRefByTarget(projectId: string): Promise<Record<string, string | null>> {
	await connectDB();
	const [units, sharedServices, capabilities, analyses] = await Promise.all([
		MigrationUnit.find({ projectId }).lean(),
		SharedService.find({ projectId }).lean(),
		Capability.find({ projectId }).select({ seqNum: 1, name: 1, primaryProjects: 1 }).lean(),
		SubProjectAnalysis.find({ projectId }).sort({ subProjectPath: 1 }).select({ subProjectPath: 1 }).lean()
	]);
	const bySeqNum = new Map(capabilities.map(c => [c.seqNum, c.primaryProjects]));
	// A shared service is a capability that others depend on, so it is traced by name.
	const byName = new Map(capabilities.map(c => [c.name, c.primaryProjects]));
	const fallback = analyses[0]?.subProjectPath ?? null;
	const refs: Record<string, string | null> = {};
	for (const unit of units) {
		refs[unit.name] = unit.capabilities.flatMap(c => bySeqNum.get(c.seqNum) ?? []).find(Boolean) ?? fallback;
	}
	for (const service of sharedServices) {
		refs[service.name] = (byName.get(service.name) ?? []).find(Boolean) ?? fallback;
	}
	return refs;
}

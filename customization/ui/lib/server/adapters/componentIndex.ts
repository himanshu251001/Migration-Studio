import type { AnalyzeTask } from '@/features/migration/analyze';
import type { Capability as UiCapability, IndexDomain, IndexResult, Level } from '@/features/migration/componentIndex';
import { dimensionForStrategy, summarizeDeepAnalysis, type CapabilityDeepAnalysis } from '../capabilities';
import type { LastRunInfo } from './runInfo';

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Reading the locked strategy', description: 'Grouping rule for the capabilities' },
	{ label: 'Deriving business capabilities', description: 'Mining the analyses for capabilities, personas and dependencies' },
	{ label: 'Grouping by the locked strategy', description: 'One bucket per domain, persona or boundary' },
	{ label: 'Writing the capability index', description: 'Index file for the destination repo' }
];

/** One stored capability, as far as the Index step shows it. */
export interface StoredCapability {
	seqNum: number;
	domain: string;
	name: string;
	personas: string[];
	frequency: Level;
	criticality: 'Critical' | Level;
	deepAnalysis: CapabilityDeepAnalysis | null;
}

/** The id the UI uses for a capability. */
export function capabilityId(seqNum: number): string {
	return `cap-${seqNum}`;
}

/** The sequence number behind a UI capability id, or `undefined` when the id is malformed. */
export function seqNumOf(id: string): number | undefined {
	const match = /^cap-(?<seq>\d{1,6})$/.exec(id);
	return match?.groups ? Number(match.groups.seq) : undefined;
}

/** Before any run: the task list with zero counts, so the running screen has something to progress against. */
export function emptyIndex(): IndexResult {
	return { tasks: TASKS.map(task => ({ ...task, doneMeta: '' })), logs: [], metrics: { components: 0, filesLinked: 0 }, breakdown: [], domains: [], duration: '' };
}

/**
 * Maps the stored capabilities to what the Index step shows. `components` counts capabilities; `filesLinked` is the
 * number of source files of the sub-projects the capabilities live in. The UI has no `Critical` level, so it reads `High`.
 */
export function adaptIndex(capabilities: readonly StoredCapability[], strategyName: string, filesLinked: number, run: LastRunInfo): IndexResult {
	if (capabilities.length === 0) {
		return emptyIndex();
	}
	const label = dimensionForStrategy(strategyName).groupingLabel;
	const byDomain = new Map<string, UiCapability[]>();
	for (const c of capabilities) {
		byDomain.set(c.domain, [...(byDomain.get(c.domain) ?? []), {
			id: capabilityId(c.seqNum),
			name: c.name,
			frequency: c.frequency,
			criticality: c.criticality === 'Critical' ? 'High' : c.criticality,
			persona: c.personas.join(', ') || 'Not specified',
			analysisSummary: c.deepAnalysis ? summarizeDeepAnalysis(c.deepAnalysis) : ''
		}]);
	}
	const domains: IndexDomain[] = [...byDomain].map(([name, items]) => ({ name, capabilities: items }));
	const critical = capabilities.filter(c => c.criticality === 'Critical' || c.criticality === 'High').length;
	const frequent = capabilities.filter(c => c.frequency === 'High').length;
	const breakdown = [
		{ label: `${label} groups`, value: `${domains.length}` },
		{ label: 'Capabilities', value: `${capabilities.length}` },
		{ label: 'Critical or high criticality', value: `${critical}` },
		{ label: 'Used frequently', value: `${frequent}` }
	];
	const meta = [strategyName, `${capabilities.length} capabilities`, `${domains.length} ${label.toLowerCase()} groups`, 'Index written'];
	return { tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index] })), logs: run.logs, metrics: { components: capabilities.length, filesLinked }, breakdown, domains, duration: run.duration };
}

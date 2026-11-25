import type { AnalyzeTask, ArtifactRef } from '@/features/migration/analyze';
import type { MigrationUnit as UiUnit, UnitsResult } from '@/features/migration/units';
import type { MigrationUnitCatalogDoc } from '../models/MigrationUnitCatalog';
import type { MigrationUnitDoc } from '../models/MigrationUnit';
import type { SharedServiceDoc } from '../models/SharedService';
import { buildMigrationUnitsCatalogMarkdown } from '../migrationUnits';
import type { LastRunInfo } from './runInfo';

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Identifying shared platform services', description: 'Capabilities that three or more others depend on' },
	{ label: 'Clustering capabilities into units', description: 'Grouped by the locked strategy, at most six per unit' },
	{ label: 'Checking unit cohesion', description: 'Shared data, shared consumers, deployability' },
	{ label: 'Writing the unit catalog', description: 'Catalog file for the destination repo' }
];

/** Before any run: the task list with zero counts, so the running screen has something to progress against. */
export function emptyUnits(): UnitsResult {
	return { tasks: TASKS.map(task => ({ ...task, doneMeta: '' })), logs: [], units: [], componentsPlaced: 0, artifacts: [], duration: '' };
}

/** The catalog file as an artifact. Written to `<dest>/migration/` by the run and opened from the screen. */
export function unitsCatalogArtifact(units: readonly MigrationUnitDoc[], sharedServices: readonly SharedServiceDoc[], catalog: Pick<MigrationUnitCatalogDoc, 'groupingLabel' | 'deviations' | 'cohesionIssues' | 'unanalyzedCapabilities'> | null): ArtifactRef & { markdown: string } {
	const markdown = buildMigrationUnitsCatalogMarkdown({
		units: [...units].sort((a, b) => a.plannerOrder - b.plannerOrder),
		sharedServices,
		unanalyzedCapabilities: catalog?.unanalyzedCapabilities ?? [],
		deviations: catalog?.deviations ?? [],
		cohesionIssues: catalog?.cohesionIssues ?? [],
		groupingLabel: catalog?.groupingLabel ?? 'Domain'
	});
	return { id: 'migration-units-catalog', name: 'migration-units-catalog.md', meta: `${units.length} units · ${sharedServices.length} shared services`, icon: 'description', path: 'migration-units-catalog.md', content: markdown, markdown };
}

/** Maps the stored units to what the Units step shows, in the planner's order. */
export function adaptUnits(units: readonly MigrationUnitDoc[], sharedServices: readonly SharedServiceDoc[], catalog: MigrationUnitCatalogDoc | null, run: LastRunInfo): UnitsResult {
	if (units.length === 0 && sharedServices.length === 0) {
		return emptyUnits();
	}
	const ordered = [...units].sort((a, b) => a.plannerOrder - b.plannerOrder);
	const uiUnits: UiUnit[] = ordered.map(unit => ({ id: unit.unitId, name: unit.name, size: unit.scopeEstimate, domain: unit.domain, capabilities: unit.capabilities.map(c => c.name).join(', ') }));
	const placed = ordered.reduce((sum, unit) => sum + unit.capabilities.length, 0);
	const issues = catalog?.cohesionIssues.length ?? 0;
	const artifact = unitsCatalogArtifact(units, sharedServices, catalog);
	const meta = [`${sharedServices.length} shared services`, `${units.length} units`, issues === 0 ? 'No cohesion issues' : `${issues} cohesion issue(s)`, '1 file'];
	return {
		tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index] })),
		logs: run.logs,
		units: uiUnits,
		componentsPlaced: placed,
		artifacts: [{ id: artifact.id, name: artifact.name, meta: artifact.meta, icon: artifact.icon, path: artifact.path, content: artifact.content }],
		duration: run.duration
	};
}

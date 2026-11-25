import type { AnalyzeTask } from '@/features/migration/analyze';
import type { DependenciesResult, DependencyWave } from '@/features/migration/dependencies';
import { buildDependencyAnalysisMarkdown, sequencingViolationsOf, type AnalysisTarget } from '../dependencyAnalysis';
import type { MigrationUnitDoc } from '../models/MigrationUnit';
import type { SharedServiceDoc } from '../models/SharedService';
import type { LastRunInfo } from './runInfo';

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Tracing dependencies between units', description: 'Shared services and cross-unit capability links' },
	{ label: 'Assessing readiness of each unit', description: 'Blockers and prerequisites, one per unit' },
	{ label: 'Detecting circular dependencies', description: 'Cycle search over the unit graph' },
	{ label: 'Computing execution order', description: 'Topological waves with parallel tracks' }
];

/** Before any run: the task list with zero counts, so the running screen has something to progress against. */
export function emptyDependencies(): DependenciesResult {
	return { tasks: TASKS.map(task => ({ ...task, doneMeta: '' })), logs: [], waves: [], crossUnitEdges: 0, sharedResources: 0, circularRefs: 0, criticalPath: '', artifacts: [], duration: '' };
}

/** Rebuilds the analysis targets from the stored units and services; `undefined` when the analysis has not run. */
export function storedTargets(units: readonly MigrationUnitDoc[], sharedServices: readonly SharedServiceDoc[]): AnalysisTarget[] | undefined {
	const targets: AnalysisTarget[] = [];
	const add = (doc: MigrationUnitDoc | SharedServiceDoc, type: AnalysisTarget['type']) => {
		if (doc.wave !== null && doc.readinessScore !== null && doc.readinessSource !== null) {
			targets.push({
				name: doc.name, type, upstreamDependencies: doc.upstreamDependencies, downstreamDependents: doc.downstreamDependents, migrationBlockers: doc.migrationBlockers,
				readinessScore: doc.readinessScore, readinessJustification: doc.readinessJustification, readinessSource: doc.readinessSource, wave: doc.wave
			});
		}
	};
	sharedServices.forEach(service => add(service, 'shared-service'));
	units.forEach(unit => add(unit, 'migration-unit'));
	return targets.length > 0 ? targets : undefined;
}

/** The longest chain of targets that must be migrated one after the other, e.g. "Shared Infrastructure → Authentication". */
function criticalPath(targets: readonly AnalysisTarget[]): string {
	const placed = targets.filter(target => typeof target.wave === 'number');
	const byName = new Map(placed.map(target => [target.name, target]));
	const last = [...placed].sort((a, b) => (b.wave as number) - (a.wave as number) || a.name.localeCompare(b.name))[0];
	if (!last) {
		return '';
	}
	const chain = [last];
	for (let current = last; (current.wave as number) > 0;) {
		const previous = current.upstreamDependencies.map(edge => byName.get(edge.name)).filter((t): t is AnalysisTarget => !!t && t !== current).sort((a, b) => (b.wave as number) - (a.wave as number) || a.name.localeCompare(b.name))[0];
		if (!previous) {
			break;
		}
		chain.unshift(previous);
		current = previous;
	}
	return chain.map(target => target.name).join(' → ');
}

/**
 * Maps the stored analysis to what the Dependencies step shows. Shared services appear as wave members next to the units.
 * `crossUnitEdges` counts every upstream edge, `sharedResources` the shared services, and `circularRefs` the targets that
 * sit in a cycle and so are listed in a final wave of their own.
 */
export function adaptDependencies(targets: readonly AnalysisTarget[] | undefined, run: LastRunInfo): DependenciesResult {
	if (!targets) {
		return emptyDependencies();
	}
	const numeric = [...new Set(targets.map(t => t.wave).filter((w): w is number => w !== 'blocked'))].sort((a, b) => a - b);
	const waves: DependencyWave[] = numeric.map(wave => ({ units: targets.filter(t => t.wave === wave).map(t => ({ name: t.name, needs: t.upstreamDependencies.map(e => e.name) })) }));
	const blocked = targets.filter(t => t.wave === 'blocked');
	if (blocked.length > 0) {
		waves.push({ units: blocked.map(t => ({ name: t.name, needs: t.upstreamDependencies.map(e => e.name) })) });
	}
	const edges = targets.reduce((sum, t) => sum + t.upstreamDependencies.length, 0);
	const services = targets.filter(t => t.type === 'shared-service').length;
	const markdown = buildDependencyAnalysisMarkdown(targets, blocked.length > 0 ? [blocked.map(t => t.name)] : [], sequencingViolationsOf(targets));
	const meta = [`${edges} edges`, `${targets.filter(t => t.readinessSource === 'claude').length} assessed by Claude`, blocked.length === 0 ? 'None found' : `${blocked.length} in a cycle`, `${waves.length} waves`];
	return {
		tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index] })),
		logs: run.logs,
		waves,
		crossUnitEdges: edges,
		sharedResources: services,
		circularRefs: blocked.length,
		criticalPath: criticalPath(targets),
		artifacts: [{ id: 'dependency-analysis', name: 'dependency-analysis.md', meta: `${targets.length} targets · ${waves.length} waves`, icon: 'account_tree', path: 'dependency-analysis.md', content: markdown }],
		duration: run.duration
	};
}

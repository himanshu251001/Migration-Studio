import type { DependenciesResult } from '@/features/migration/dependencies';

/** Sample cross-unit dependencies of the legacy "Customer Portal" codebase. */
export const DEPENDENCIES_FIXTURE: DependenciesResult = {
	tasks: [
		{ label: 'Tracing calls between units', description: 'Static call graph across unit boundaries', total: 48, doneMeta: '11 cross-unit edges' },
		{ label: 'Detecting shared state and data', description: 'Session, cache and database tables', doneMeta: '6 shared resources' },
		{ label: 'Detecting circular dependencies', description: 'Cycle search over the unit graph', doneMeta: 'None found' },
		{ label: 'Computing execution order', description: 'Topological order with parallel tracks', doneMeta: 'Order fixed' }
	],
	logs: [
		'[INFO] Building unit dependency graph',
		'[DEBUG] UNIT-04 -> UNIT-02 via SessionProvider',
		'[DEBUG] UNIT-04 -> UNIT-03 via CartRepository',
		'[INFO] Detecting circular dependencies ... none',
		'[INFO] Execution order: 01 -> 02,03 -> 04 -> 05'
	],
	waves: [
		{ units: [{ name: 'Shared Infrastructure', needs: [] }] },
		{ units: [{ name: 'Authentication', needs: ['Shared Infrastructure'] }, { name: 'Catalog', needs: ['Shared Infrastructure'] }] },
		{ units: [{ name: 'Cart & Checkout', needs: ['Authentication', 'Catalog'] }] },
		{ units: [{ name: 'Orders Portal', needs: ['Cart & Checkout'] }] }
	],
	crossUnitEdges: 11,
	sharedResources: 6,
	circularRefs: 0,
	criticalPath: 'Shared Infrastructure → Authentication → Cart & Checkout → Orders Portal',
	artifacts: [
		{
			id: 'dependency-graph',
			icon: 'account_tree',
			name: 'dependency-graph.json',
			meta: '0.9 MB · Unit graph & waves',
			path: 'dependency-graph.json',
			content: JSON.stringify({
				project: 'Customer Portal',
				crossUnitEdges: 11,
				sharedResources: 6,
				circularRefs: 0,
				waves: [['UNIT-01'], ['UNIT-02', 'UNIT-03'], ['UNIT-04'], ['UNIT-05']]
			}, undefined, '\t') + '\n'
		}
	],
	duration: '47s'
};

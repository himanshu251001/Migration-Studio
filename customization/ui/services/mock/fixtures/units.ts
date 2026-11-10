import type { UnitsResult } from '@/features/migration/units';

/** Sample migration units of the legacy "Customer Portal" codebase. */
export const UNITS_FIXTURE: UnitsResult = {
	tasks: [
		{ label: 'Clustering components by cohesion', description: 'Shared data and call-graph affinity', total: 86, doneMeta: '86 placed' },
		{ label: 'Grouping into 5 migration units', description: 'Shared, Auth, Catalog, Cart, Orders', doneMeta: '5 units · 24s' },
		{ label: 'Checking unit boundaries', description: 'No component belongs to two units', doneMeta: '0 overlaps' },
		{ label: 'Serializing migration-plan.json', description: 'Writing units to the destination repo', doneMeta: '3.8 MB · 23s' }
	],
	logs: [
		'[INFO] Loading component-index.json',
		'[DEBUG] Cohesion score 0.82 for Catalog cluster',
		'[INFO] Grouped modules into UNIT-01 ... UNIT-05',
		'[INFO] Boundary check: 0 overlaps',
		'[INFO] Wrote migration-plan.json'
	],
	units: [
		{ id: 'UNIT-01', name: 'Shared Infrastructure', size: 'Small', domain: 'Platform', capabilities: 'Logging, Configuration, Caching' },
		{ id: 'UNIT-02', name: 'Authentication', size: 'Medium', domain: 'Identity', capabilities: 'Login, Session management, Role checks' },
		{ id: 'UNIT-03', name: 'Catalog', size: 'Large', domain: 'E-commerce', capabilities: 'Product listing, Search, Pricing' },
		{ id: 'UNIT-04', name: 'Cart & Checkout', size: 'Large', domain: 'Payments', capabilities: 'Cart, Order placement, Payment gateway' },
		{ id: 'UNIT-05', name: 'Orders Portal', size: 'Medium', domain: 'Integration', capabilities: 'CRUD endpoints, Webhook receivers' }
	],
	componentsPlaced: 86,
	artifacts: [
		{
			id: 'migration-plan',
			icon: 'javascript',
			name: 'migration-plan.json',
			meta: '3.8 MB · Units & AST map',
			path: 'migration-plan.json',
			content: JSON.stringify({ project: 'Customer Portal', units: ['UNIT-01', 'UNIT-02', 'UNIT-03', 'UNIT-04', 'UNIT-05'], componentsPlaced: 86, overlaps: 0 }, undefined, '\t') + '\n'
		}
	],
	duration: '1m 08s'
};

import type { IndexResult } from '@/features/migration/componentIndex';

/** Sample component index of the legacy "Customer Portal" codebase. */
export const INDEX_FIXTURE: IndexResult = {
	tasks: [
		{ label: 'Enumerating components', description: 'Pages, user controls, services, data classes', total: 86, doneMeta: '86 components' },
		{ label: 'Classifying by type and layer', description: 'UI, business logic, data access, shared', doneMeta: '4 layers' },
		{ label: 'Linking components to source files', description: 'Code-behind, markup and config', total: 1245, doneMeta: '1,245 files linked' },
		{ label: 'Writing the component index', description: 'Searchable index for later steps', doneMeta: 'Index written' }
	],
	logs: [
		'[INFO] Indexing /Views/**/*.aspx (64 pages)',
		'[INFO] Indexing /Controls/**/*.ascx (14 controls)',
		'[DEBUG] 8 shared helpers referenced by 3+ pages',
		'[INFO] Linked code-behind for 64 pages',
		'[INFO] component-index.json written (86 entries)'
	],
	metrics: { components: 86, filesLinked: 1245 },
	breakdown: [
		{ label: 'UI layer', value: '78 pages and controls' },
		{ label: 'Business logic', value: 'Cart, Checkout, Pricing services' },
		{ label: 'Data access', value: 'EF6 context + 34 POCO models' },
		{ label: 'Shared', value: 'Logging, config, Autofac modules' }
	],
	domains: [
		{
			name: 'Integration',
			capabilities: [
				{ id: 'crud-endpoints', name: 'CRUD endpoints', frequency: 'Medium', criticality: 'Medium', persona: 'Internal service consumers', analysisSummary: '3 entry points, 2 data stores' },
				{ id: 'webhook-receivers', name: 'Webhook receivers', frequency: 'Medium', criticality: 'Medium', persona: 'Internal service consumers', analysisSummary: '2 entry points, 1 data store' }
			]
		},
		{
			name: 'Catalog',
			capabilities: [
				{ id: 'product-listing', name: 'Product listing', frequency: 'High', criticality: 'Medium', persona: 'Shoppers', analysisSummary: '4 entry points, 2 data stores' },
				{ id: 'search-filtering', name: 'Search & filtering', frequency: 'High', criticality: 'Medium', persona: 'Shoppers', analysisSummary: '3 entry points, 1 data store' },
				{ id: 'pricing-rules', name: 'Pricing rules', frequency: 'Medium', criticality: 'High', persona: 'Merchandisers', analysisSummary: '2 entry points, 3 data stores' }
			]
		},
		{
			name: 'Checkout',
			capabilities: [
				{ id: 'cart-management', name: 'Cart management', frequency: 'High', criticality: 'High', persona: 'Shoppers', analysisSummary: '5 entry points, 2 data stores' },
				{ id: 'order-placement', name: 'Order placement', frequency: 'High', criticality: 'High', persona: 'Shoppers', analysisSummary: '4 entry points, 4 data stores' }
			]
		},
		{
			name: 'Identity',
			capabilities: [
				{ id: 'login-session', name: 'Login & session', frequency: 'High', criticality: 'High', persona: 'All users', analysisSummary: '3 entry points, 2 data stores' },
				{ id: 'role-checks', name: 'Role checks', frequency: 'Medium', criticality: 'High', persona: 'Admins', analysisSummary: '2 entry points, 1 data store' }
			]
		}
	],
	duration: '58s'
};

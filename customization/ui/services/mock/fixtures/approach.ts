import type { ApproachResult } from '@/features/migration/approach';

/** Sample approach evaluation for the legacy "Customer Portal" codebase. */
export const APPROACH_FIXTURE: ApproachResult = {
	tasks: [
		{ label: 'Reviewing architectural patterns and AST inputs', description: 'Mapping module boundaries', total: 42, doneMeta: '42 boundaries · 18s' },
		{ label: 'Evaluating candidate strategies', description: 'Capability, domain and technical-layer decomposition', doneMeta: '3 strategies · 12s' },
		{ label: 'Scoring strategies against risk and coupling', description: 'Weighted by data-layer coupling and downtime tolerance', doneMeta: 'Scored · 9s' },
		{ label: 'Recording the recommendation', description: 'Rationale and trade-offs for reviewers', doneMeta: 'Recommendation ready' }
	],
	logs: [
		'[INFO] Loading migration-analysis-report.json (4.2 MB)',
		'[INFO] 42 module boundaries mapped',
		'[DEBUG] Domain-driven split blocked: no bounded contexts in the data model',
		'[DEBUG] Capability-based scores highest for this topology',
		'[INFO] Recommendation written'
	],
	options: [
		{ id: 'capability', name: 'Capability-Based', suitability: 'Medium', score: 72, recommended: true, when: 'When sub-projects expose clear, distinct business capabilities.' },
		{ id: 'domain', name: 'Domain-Driven', suitability: 'Low', score: 41, recommended: false, when: 'When bounded contexts already exist in the data model.' },
		{ id: 'layer', name: 'Technical Layer', suitability: 'Low', score: 22, recommended: false, when: 'When UI, services and data can move independently.' }
	],
	pattern: 'Capability-Based',
	rationale: 'Across the portal the clearest recurring boundary in the evidence is business capability, not technical layer or persona. Session state and the data layer are tightly coupled to page code-behind, so a one-shot cut-over carries too much risk; incremental replacement keeps the portal live throughout.',
	boundaries: [
		{ name: 'Catalog service boundary', risk: 'Low', description: 'Product listing, search and pricing rules, derived from the codebase analysis.' },
		{ name: 'Checkout service boundary', risk: 'Medium', description: 'Cart management and order placement, sharing session state with Identity.' }
	],
	risks: [
		{ level: 'Medium', text: 'No typed request validation on older routes', mitigation: 'Address during decomposition before locking the migration unit.' },
		{ level: 'High', text: 'Shared database instance couples otherwise-independent units', mitigation: 'Resolve the data-ownership boundary before locking units that touch shared tables.' }
	],
	duration: '39s'
};

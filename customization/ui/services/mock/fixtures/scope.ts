import type { ScopeResult } from '@/features/migration/scope';

const UNIT_ITEM = 'Migration unit locked in the Migration Units Catalog.';

/** Sample scope, goals and target stack candidates of the legacy "Customer Portal" codebase. */
export const SCOPE_FIXTURE: ScopeResult = {
	tasks: [
		{ label: 'Drafting scope from units and dependencies', description: 'In-scope and out-of-scope items', doneMeta: '5 units in scope' },
		{ label: 'Proposing goals', description: 'Modernization, deployability, risk', doneMeta: '4 goals' },
		{ label: 'Proposing target stacks', description: 'Candidates with architecture trade-offs', doneMeta: '3 candidates' },
		{ label: 'Finding gaps against the target', description: 'Legacy behavior without a target equivalent', doneMeta: '4 gaps' }
	],
	logs: [
		'[INFO] Drafting scope from 5 units',
		'[DEBUG] Reporting dashboards marked out of scope (separate vendor)',
		'[INFO] Goals: deployability, capability alignment, risk-ordered sequencing',
		'[INFO] 4 gaps need a reviewer decision',
		'[INFO] Awaiting reviewer confirmation'
	],
	goals: [
		{ title: 'Independent deployability', description: 'Each migration unit can be built, tested, and deployed on its own.', success: 'Every locked migration unit has its own task set with no cross-unit blocking task.' },
		{ title: 'Business-capability alignment', description: 'The target architecture is organized around business capabilities, not incidental code structure.', success: 'Every migration unit maps to one or more named capabilities in the capability index.' },
		{ title: 'Risk-ordered sequencing', description: 'Higher-risk, higher-complexity boundaries are addressed earlier in the roadmap.', success: 'Wave assignments in the dependency analysis place shared services ahead of their consumers.' },
		{ title: 'Risk mitigation', description: 'Every High/Critical risk identified during decomposition has an owned mitigation commitment.', success: "Every risk in the Charter's risk register has a named mitigation commitment." }
	],
	stacks: [
		{ id: 'aspnet', name: 'ASP.NET Core', architecture: 'full-stack-consolidation', description: 'Collapse the legacy application into a single ASP.NET Core deployable, reducing operational surface to one service.', tradeoff: 'Lowest long-term ops overhead, but merges the security boundary between UI and API into one deployable. Requires careful secrets and auth scoping.' },
		{ id: 'nest', name: 'NestJS', architecture: 'frontend-plus-modernized-backend', description: 'Keep the sub-projects as separately deployed services, modernizing the backend-shaped one onto NestJS while other sub-projects call it over REST or GraphQL.', tradeoff: "Preserves today's multi-service security boundary and independent scaling, at the cost of maintaining multiple deployables and network hops." },
		{ id: 'django', name: 'Django', architecture: 'frontend-only', description: 'Migrate only the UI-shaped sub-projects onto Django, leaving the remaining sub-projects running untouched behind their existing APIs.', tradeoff: 'Lowest risk and fastest to ship, but backend technical debt and its own end-of-life risk remain unaddressed.' }
	],
	databases: ['Keep existing DB, swap data-access layer', 'Migrate to PostgreSQL', 'Migrate to a managed cloud database'],
	strategies: ['Incremental / strangler-fig', 'Big-bang cut-over'],
	gaps: [
		{
			id: 'GAP-01', area: 'Authentication & Authorization', title: 'Session token storage must move to httpOnly cookies',
			risk: 'High', effort: 'Medium', uiParity: 'Low', functionalParity: 'High',
			exists: 'src/auth/session.ts: AuthService.storeToken() writes the session token to localStorage after login.',
			needed: 'On the target stack, the token must be set as an httpOnly, Secure cookie from the auth callback so client-side JS can never read it.',
			options: [
				{ title: 'Server-set httpOnly cookie', description: 'Auth callback sets the cookie directly; client never handles the raw token.', recommended: true },
				{ title: 'Short-lived token + refresh endpoint', description: 'Keep a short-lived token in memory and refresh it via a dedicated endpoint.', recommended: false }
			]
		},
		{
			id: 'GAP-02', area: 'State Management', title: 'Global cart/session state has no target-stack equivalent yet',
			risk: 'Medium', effort: 'Large', uiParity: 'Medium', functionalParity: 'Medium',
			exists: 'src/state/globalStore.ts: a single global object shared by 12 components.',
			needed: 'Port to the state-management pattern implied by the locked target stack, with one slice or store per domain instead of one global object.',
			options: [
				{ title: 'One-shot full port', description: 'Rewrite all 12 consuming components against the new store in one pass.', recommended: false },
				{ title: 'Adapter layer first', description: "Wrap the new store behind the old store's interface, migrate components incrementally.", recommended: true }
			]
		},
		{
			id: 'GAP-03', area: 'Data Access', title: 'Hand-written SQL helpers bypass the target ORM',
			risk: 'Medium', effort: 'Medium', uiParity: 'Low', functionalParity: 'Medium',
			exists: 'src/data/sqlHelpers.ts: 34 helpers build SQL strings by concatenation.',
			needed: "Queries must go through the target stack's data-access layer so they are parameterized and testable.",
			options: [
				{ title: 'Repository layer wrapping existing SQL', description: 'Keep the queries, move them behind typed repositories first.', recommended: true },
				{ title: 'Port every query to the ORM', description: "Rewrite each helper with the ORM's query builder.", recommended: false }
			]
		},
		{
			id: 'GAP-04', area: 'Legacy Report Scheduler', title: 'Nightly report-generation cron has no owner in the target stack',
			risk: 'High', effort: 'Medium', uiParity: 'Low', functionalParity: 'High',
			exists: 'ops/crontab: a server cron invokes report.exe nightly; nothing in application code triggers it.',
			needed: 'This does not map cleanly to any baseline category. It needs an explicit scheduled-job mechanism on the target stack.',
			options: [
				{ title: 'Platform-level scheduled task', description: "Use the hosting platform's native cron or scheduled-task feature to invoke a target-stack endpoint nightly.", recommended: true },
				{ title: 'In-app scheduler', description: 'Run a scheduler library inside the app process that fires the job on an interval.', recommended: false }
			]
		}
	],
	sections: [
		{
			id: 'in-scope', title: 'In Scope', summary: '5 items',
			items: ['Shared Infrastructure', 'Authentication', 'Catalog', 'Cart & Checkout', 'Orders Portal'].map(title => ({ title, description: UNIT_ITEM }))
		},
		{
			id: 'out-of-scope', title: 'Out of Scope', summary: '1 item',
			items: [{ title: 'Reporting dashboards', description: 'Excluded from this charter; revisit after cut-over.' }]
		},
		{
			id: 'success', title: 'Success Criteria', summary: '1 wave',
			items: [{ title: 'Wave 0: Shared Infrastructure', description: 'Functional parity tests green and at least 80% coverage before dependent waves start.' }]
		},
		{
			id: 'governance', title: 'Governance', summary: '4 decisions',
			items: [
				{ title: 'Approvals', description: 'Each wave is signed off by the product owner and the tech lead.' },
				{ title: 'Change control', description: 'Scope changes after sign-off require a charter amendment.' },
				{ title: 'Risk register', description: 'Every High/Critical risk has a named owner and mitigation.' },
				{ title: 'Escalation', description: 'Blocked units escalate to the steering group within two working days.' }
			]
		}
	],
	duration: '38s'
};

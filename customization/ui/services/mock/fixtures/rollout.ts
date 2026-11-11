import type { RolloutResult } from '@/features/migration/rollout';

/** Sample rollout strategy for the legacy "Customer Portal" codebase. */
export const ROLLOUT_FIXTURE: RolloutResult = {
	tasks: [
		{ label: 'Designing the routing facade', description: 'Send traffic to legacy or modern per route', doneMeta: 'Proxy routes defined' },
		{ label: 'Defining feature flags and canaries', description: 'Gradual exposure per unit', doneMeta: '5 flags' },
		{ label: 'Planning data sync and cut-over', description: 'Shared database until the final switch', doneMeta: '2 windows' },
		{ label: 'Writing the rollback plan', description: 'Revert triggers and steps', doneMeta: 'Rollback ready' }
	],
	logs: [
		'[INFO] Routing facade in front of the legacy service',
		'[DEBUG] Flag integration-wave default off',
		'[INFO] Canary steps 5% -> 25% -> 100%',
		'[INFO] Rollback plan written'
	],
	modules: 2,
	waves: 1,
	decisions: 2,
	attention: [
		'Confirm role-guard mapping per capability during task planning.',
		'Confirm background-job configuration parity (retry/backoff) with the legacy system.'
	],
	cards: [
		{
			id: 'overview',
			title: 'Overview',
			sub: 'Executive summary',
			bullets: [
				'This migration targets NestJS (TypeScript, api-only-service) using a "frontend-plus-modernized-backend" architecture.',
				'Rollout follows an "incremental" strategy across 1 wave, covering 1 migration unit and 0 shared services. Database approach: keep-existing.'
			]
		},
		{
			id: 'topology',
			title: 'Production Topology',
			sub: 'Target environment',
			bullets: [
				'NestJS API runs as a containerized service behind a routing facade that sends each route to legacy or modern.',
				'The existing database is shared by both services until the final cut-over; no schema forks.'
			]
		},
		{
			id: 'platform',
			title: 'Platform',
			sub: 'Auth, session, data access, jobs',
			bullets: [
				'Auth: Passport strategies and guards replace the legacy auth/session middleware.',
				'Session: stateless tokens, validated by the same guard on every route.',
				'Data access: TypeORM / Prisma over the existing database.',
				'Jobs: Bull queue replaces the in-process background jobs.'
			]
		},
		{
			id: 'structure',
			title: 'Application Structure',
			sub: '2 modules',
			bullets: [
				'Integration module: CRUD endpoints and controller actions.',
				'Webhooks module: webhook receivers and their background jobs.'
			]
		},
		{
			id: 'waves',
			title: 'Rollout by Wave',
			sub: '1 wave',
			bullets: [
				'Wave 0, Integration (2 modules): shadow traffic, 5% canary behind a feature flag, then full cut-over once parity checks pass.'
			]
		},
		{
			id: 'coexistence',
			title: 'Coexistence & Rollback',
			sub: '2 rules · 2 triggers',
			bullets: [
				'Rule: legacy and modern never write the same table in the same request path.',
				'Rule: the legacy route stays deployable until the wave has run clean for one full release cycle.',
				'Trigger: error rate above 1% for 10 minutes, flip the flag back to legacy.',
				'Trigger: p95 latency above 500 ms for 10 minutes, flip the flag back to legacy.'
			]
		},
		{
			id: 'data',
			title: 'Data Migration Principles',
			sub: '2 principles',
			bullets: [
				'Keep the existing database; swap only the data-access layer.',
				'Any schema change is additive and backwards compatible until the legacy service is retired.'
			]
		},
		{
			id: 'decisions',
			title: 'Architectural Decisions',
			sub: '2 decisions',
			bullets: [
				'Incremental (strangler-fig) rollout rather than a big-bang cut-over, to keep the portal live.',
				'REST between services; GraphQL is deferred until a second consumer needs it.'
			]
		}
	],
	duration: '1m 12s'
};

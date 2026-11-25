/** A target technology stack the planner can propose. Fixed catalog: no database is needed to list it. */
export interface TargetStackEntry {
	key: string;
	name: string;
	language: string;
	architecturePattern: 'full-stack-monolith' | 'api-only-service';
	routing: string;
	dataAccess: string;
	auth: string;
	backgroundJobs: string;
}

const CATALOG: readonly TargetStackEntry[] = [
	{ key: 'nextjs', name: 'Next.js', language: 'TypeScript/JavaScript', architecturePattern: 'full-stack-monolith', routing: 'App Router (file-based)', dataAccess: 'Prisma / Drizzle', auth: 'NextAuth / middleware', backgroundJobs: 'Vercel Cron / external queue worker' },
	{ key: 'spring-boot', name: 'Spring Boot', language: 'Java', architecturePattern: 'api-only-service', routing: '@RequestMapping controllers', dataAccess: 'JPA / Hibernate', auth: 'Spring Security', backgroundJobs: '@Scheduled / message listeners' },
	{ key: 'aspnet-core', name: 'ASP.NET Core', language: 'C#', architecturePattern: 'full-stack-monolith', routing: 'Minimal APIs / MVC controllers', dataAccess: 'EF Core', auth: 'ASP.NET Core Identity', backgroundJobs: 'IHostedService / Hangfire' },
	{ key: 'nestjs', name: 'NestJS', language: 'TypeScript', architecturePattern: 'api-only-service', routing: '@Controller decorators', dataAccess: 'TypeORM / Prisma', auth: 'Passport strategies + guards', backgroundJobs: 'Bull queue' },
	{ key: 'django', name: 'Django', language: 'Python', architecturePattern: 'full-stack-monolith', routing: 'urls.py path table', dataAccess: 'Django ORM', auth: 'Django auth + DRF permissions', backgroundJobs: 'Celery' }
];

/** The reviewer's choice of database approach; the first keeps the existing database. */
export const DATABASE_OPTIONS: readonly string[] = ['Keep existing DB, swap data-access layer', 'Migrate to PostgreSQL', 'Migrate to a managed cloud database'];

/** The reviewer's choice of rollout approach; the first is the incremental one. */
export const ROLLOUT_STRATEGIES: readonly string[] = ['Incremental / strangler-fig', 'Big-bang cut-over'];

/** Whether the chosen database option leaves the existing database in place. */
export function keepsExistingDatabase(database: string): boolean {
	return database === DATABASE_OPTIONS[0];
}

/** A stack candidate as the planner proposes it, before the UI shapes it. */
export interface StackProposal {
	/** Id the reviewer picks; the catalog key. */
	id: string;
	stack: TargetStackEntry;
	architecture: string;
	description: string;
	tradeoff: string;
}

/** Proposes up to three candidates from the catalog, as migrator-ui does: consolidation, frontend plus backend, frontend only. */
export function proposeStackCandidates(frameworks: readonly string[]): StackProposal[] {
	const monoliths = CATALOG.filter(stack => stack.architecturePattern === 'full-stack-monolith');
	const apiOnly = CATALOG.filter(stack => stack.architecturePattern === 'api-only-service');
	const frameworkList = [...new Set(frameworks.filter(Boolean))].join(', ') || 'the detected sub-projects';
	const proposals: StackProposal[] = [];
	if (monoliths[0]) {
		proposals.push({ id: monoliths[0].key, stack: monoliths[0], architecture: 'full-stack-consolidation', description: `Collapse ${frameworkList} into a single ${monoliths[0].name} deployable, reducing operational surface to one service.`, tradeoff: 'Lowest long-term ops overhead, but merges the security boundary between UI and API into one deployable. Requires careful secrets and auth scoping.' });
	}
	if (apiOnly[0]) {
		proposals.push({ id: apiOnly[0].key, stack: apiOnly[0], architecture: 'frontend-plus-modernized-backend', description: `Keep the sub-projects as separately deployed services, modernizing the backend-shaped one onto ${apiOnly[0].name} while other sub-projects call it over REST or GraphQL.`, tradeoff: "Preserves today's multi-service security boundary and independent scaling, at the cost of maintaining multiple deployables and network hops." });
	}
	if (monoliths[1]) {
		proposals.push({ id: monoliths[1].key, stack: monoliths[1], architecture: 'frontend-only', description: `Migrate only the UI-shaped sub-projects onto ${monoliths[1].name}, leaving the remaining sub-projects running untouched behind their existing APIs.`, tradeoff: 'Lowest risk and fastest to ship, but backend technical debt and its own end-of-life risk remain unaddressed.' });
	}
	return proposals;
}

/** The catalog entry for a candidate id; undefined for an unknown id. */
export function stackById(id: string): TargetStackEntry | undefined {
	return CATALOG.find(stack => stack.key === id);
}

/** What a stack typed in by the reviewer looks like to the engines: only its name is known. */
export function customStackEntry(name: string): TargetStackEntry {
	return { key: 'custom', name, language: `${name}'s own language`, architecturePattern: 'full-stack-monolith', routing: `${name}'s own routing`, dataAccess: `${name}'s own data-access layer`, auth: `${name}'s own authentication`, backgroundJobs: `${name}'s own background-job mechanism` };
}

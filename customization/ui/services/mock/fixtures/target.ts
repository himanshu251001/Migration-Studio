import type { TargetResult } from '@/features/migration/target';

/** Sample source-to-target mappings of the legacy "Customer Portal" codebase. */
export const TARGET_FIXTURE: TargetResult = {
	tasks: [
		{ label: 'Mapping frameworks and runtime', description: 'Express.js to the target framework', doneMeta: '7 mappings' },
		{ label: 'Mapping the data layer', description: 'ORM models to target entities', total: 34, doneMeta: '34 models' },
		{ label: 'Mapping auth and session', description: 'Session middleware to guards', doneMeta: 'Guards drafted' },
		{ label: 'Drafting sample conversions', description: 'One reference file per layer', doneMeta: '3 samples' }
	],
	logs: [
		'[INFO] routes/catalog.js -> CatalogController',
		'[INFO] middleware/auth.js -> Passport strategy + guard',
		'[DEBUG] Rewriting 34 ORM models as target entities',
		'[INFO] jobs/reports.js -> Bull queue processor'
	],
	source: 'Express.js API service',
	mappings: [
		{ id: 'auth-mechanism', legacy: 'Express.js API service auth/session middleware', target: 'Passport strategies + guards', text: 'Maps each auth/session middleware in Express.js API service to Passport strategies + guards in the target stack.' },
		{ id: 'background-job', legacy: 'Express.js API service background jobs', target: 'Bull queue', text: 'Maps each background job in Express.js API service to a Bull queue processor in the target stack.' },
		{ id: 'controller-action', legacy: 'Express.js API service controller actions', target: '@Controller decorators', text: 'Maps each controller action in Express.js API service to @Controller decorators in the target stack.' },
		{ id: 'orm-model', legacy: 'Express.js API service ORM model', target: 'TypeORM / Prisma', text: 'Maps each ORM model in Express.js API service to TypeORM / Prisma entities in the target stack.' },
		{ id: 'routing', legacy: 'Express.js API service route table', target: '@Controller decorators', text: 'Maps each route table in Express.js API service to @Controller decorators in the target stack.' },
		{ id: 'serializer', legacy: 'Express.js API service response serializer', target: 'TypeScript response-shaping layer', text: 'Maps each response serializer in Express.js API service to a TypeScript response-shaping layer in the target stack.' },
		{ id: 'state-pattern', legacy: 'Express.js API service client state store', target: 'TypeScript state layer', text: 'Maps each client state store in Express.js API service to a TypeScript state layer in the target stack.' }
	],
	duration: '1m 31s'
};

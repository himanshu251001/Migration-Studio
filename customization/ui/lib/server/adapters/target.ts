import type { AnalyzeTask } from '@/features/migration/analyze';
import type { TargetResult } from '@/features/migration/target';
import type { TargetMappingDoc } from '../models/TargetMapping';
import type { LastRunInfo } from './runInfo';

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Reading the locked target stack', description: 'Routing, data access, auth and jobs of the chosen stack' },
	{ label: 'Finding legacy patterns', description: 'State, ORM, controllers, serializers, jobs, auth and routing' },
	{ label: 'Mapping each pattern to the target', description: 'One mapping per category, with an example' },
	{ label: 'Writing the mapping library', description: 'Library file for the destination repo' }
];

/** Before any run: the task list with no mappings, so the running screen has something to progress against. */
export function emptyTarget(): TargetResult {
	return { tasks: TASKS.map(task => ({ ...task, doneMeta: '' })), logs: [], source: '', mappings: [], duration: '' };
}

/** Maps the stored mapping library to what the Target step shows; a mapping's id is its category and its text the description. */
export function adaptTarget(doc: TargetMappingDoc | null, run: LastRunInfo): TargetResult {
	if (!doc) {
		return emptyTarget();
	}
	const meta = [doc.targetStackName, `${doc.entries.length} legacy patterns`, `${doc.entries.length} mappings`, '1 file'];
	return {
		tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index] })),
		logs: run.logs,
		source: doc.sourceStack,
		mappings: doc.entries.map(entry => ({ id: entry.category, legacy: entry.legacyPattern, target: entry.targetPattern, text: entry.description })),
		duration: run.duration
	};
}

import type { Task } from '@/components/ui';
import type { AnalyzeTask } from '@/features/migration/analyze';

function format(n: number): string {
	return n.toLocaleString('en-US');
}

/** Task states at `progress` (0..1): tasks finish in order, each taking an equal share of the run. */
export function toTasks(tasks: readonly AnalyzeTask[], progress: number, finished: boolean): Task[] {
	return tasks.map((t, i) => {
		const local = progress * tasks.length - i;
		if (finished || local >= 1) {
			return { label: t.label, meta: t.doneMeta, state: 'done' };
		}
		if (local > 0 || (i === 0 && progress === 0)) {
			const frac = Math.max(0, local);
			return { label: t.label, meta: t.total ? `${format(Math.round(frac * t.total))} / ${format(t.total)}` : 'working', state: 'active', progress: frac };
		}
		return { label: t.label, state: 'queued' };
	});
}

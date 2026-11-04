import { Icon } from './Icon';
import { ProgressBar } from './ProgressBar';

export type TaskState = 'done' | 'active' | 'queued';

export interface Task {
	readonly label: string;
	/** Secondary text after the label: a summary when done, a count while active. */
	readonly meta?: string;
	readonly state: TaskState;
	/** 0..1, shown while active. */
	readonly progress?: number;
}

const ICONS: Record<TaskState, { name: string; cls: string }> = {
	done: { name: 'check_circle', cls: 'text-tertiary' },
	active: { name: 'progress_activity', cls: 'text-primary animate-spin' },
	queued: { name: 'radio_button_unchecked', cls: 'text-outline' }
};

/** A checklist of pipeline tasks with a progress bar on the active one. */
export function TaskList({ tasks }: { tasks: readonly Task[] }) {
	return (
		<ul className="space-y-space-sm">
			{tasks.map(t => (
				<li key={t.label} className="space-y-space-xs">
					<div className="flex items-center gap-space-sm">
						<Icon name={ICONS[t.state].name} className={`text-[18px] ${ICONS[t.state].cls}`} />
						<span className={`text-body-sm font-body-sm ${t.state === 'queued' ? 'text-outline' : 'text-on-surface'}`}>{t.label}</span>
						{t.meta && <span className="font-label-sm text-label-sm text-outline">· {t.meta}</span>}
					</div>
					{t.state === 'active' && <ProgressBar pct={(t.progress ?? 0) * 100} />}
				</li>
			))}
		</ul>
	);
}

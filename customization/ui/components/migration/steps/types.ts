import type { Project } from '@/features/migration/types';

export interface StepViewProps {
	readonly project: Project;
	readonly kind: 'running' | 'done';
	/** Reports whether the reviewer may continue to the next step. Steps that need sign-off call it with false until done. */
	readonly onGate: (canContinue: boolean) => void;
}

import type { Project } from '@/features/migration/types';

export interface StepViewProps {
	readonly project: Project;
	readonly kind: 'running' | 'done';
}

'use client';

import { Badge, Button, Icon, Panel } from '@/components/ui';
import { nextScreen, prevScreen, screenDef, STEP_DEFS, type ScreenKey } from '@/features/migration/steps';
import type { Project } from '@/features/migration/types';
import { useMigration } from '@/state/MigrationProvider';
import { STEP_VIEWS } from './steps';
import { ScreenHeader } from './shell/ScreenHeader';
import { StepperNav } from './shell/StepperNav';

/**
 * Frame shared by all step screens: header, stepper and Back/Continue navigation.
 * Steps registered in STEP_VIEWS render their own content; the rest show a placeholder (milestones M3-M11).
 */
export function PhaseScreen({ screen, project }: { screen: Exclude<ScreenKey, 'ready'>; project: Project }) {
	const { go, exit } = useMigration();
	const def = screenDef(screen);
	const step = STEP_DEFS[def.step];
	const next = nextScreen(screen);
	const prev = prevScreen(screen);
	const done = def.kind === 'done';
	const StepView = STEP_VIEWS[step.slug];
	// A built running screen advances by itself when its work finishes.
	const autoAdvances = !!StepView && !done;

	return (
		<div className="flex flex-col w-full p-space-lg space-y-space-lg text-on-surface">
			<ScreenHeader
				title={project.name}
				badges={<Badge className={done ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{done ? `${step.label} complete` : 'In progress'}</Badge>}
				trail={[`${project.name} Workspace`, 'Migration', step.label]}
				actions={<Button variant="ghost" icon="logout" onClick={exit}>Exit</Button>}
			/>
			<StepperNav screen={screen} />
			{StepView
				? <StepView project={project} kind={done ? 'done' : 'running'} />
				: (
					<Panel icon="construction" iconClass="text-secondary" title={`Step ${def.step + 1} of ${STEP_DEFS.length} · ${step.label}`}>
						<p className="text-body-md font-body-md text-on-surface-variant">
							This step is not built yet. It will be added in a later milestone; navigation and state already work.
						</p>
					</Panel>
				)}
			<div className="flex items-center justify-between border-t border-outline-variant/40 pt-space-md">
				<Button icon="arrow_back" onClick={() => prev && go(prev)} disabled={!prev}>Back</Button>
				{next && !autoAdvances && (
					<Button variant="primary" onClick={() => go(next)}>
						{done ? 'Next step' : 'Mark complete'}
						<Icon name="arrow_forward" className="text-[16px]" />
					</Button>
				)}
			</div>
		</div>
	);
}

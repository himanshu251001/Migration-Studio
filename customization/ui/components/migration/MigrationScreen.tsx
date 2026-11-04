'use client';

import type { ScreenKey } from '@/features/migration/steps';
import { PhaseScreen } from './PhaseScreen';
import { ReadyScreen } from './ReadyScreen';
import { ProjectGuard } from './shell/ProjectGuard';

/** Picks the screen for a route key. Step content registers here as each step is built. */
export function MigrationScreen({ screen }: { screen: ScreenKey }) {
	return (
		<ProjectGuard>
			{project => screen === 'ready' ? <ReadyScreen project={project} /> : <PhaseScreen key={screen} screen={screen} project={project} />}
		</ProjectGuard>
	);
}

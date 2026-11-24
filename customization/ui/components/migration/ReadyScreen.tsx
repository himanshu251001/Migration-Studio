'use client';

import { useState } from 'react';
import { Badge, Button, Icon } from '@/components/ui';
import type { Project } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';
import { useMigration } from '@/state/MigrationProvider';
import { useNavigate } from '@/state/useNavigate';
import { ScreenHeader } from './shell/ScreenHeader';
import { StepperNav } from './shell/StepperNav';

type Stage = 'idle' | 'starting';

/** Pre-migration screen: shows the project and starts the pipeline. */
export function ReadyScreen({ project }: { project: Project }) {
	const { go } = useMigration();
	const navigate = useNavigate();
	const { migration } = useServices();
	const [stage, setStage] = useState<Stage>('idle');

	const start = async () => {
		setStage('starting');
		await migration.start(project);
		go('analyze');
	};

	return (
		<div className="flex flex-col w-full">
			<div className="px-space-xl pt-space-lg pb-space-lg bg-surface-container-lowest shadow-sm">
				<ScreenHeader
					title={project.name}
					badges={<>
						<Badge className="bg-surface-container-high text-on-surface-variant">Ready to migrate</Badge>
						<Badge className="bg-surface-container text-secondary">Zero running jobs</Badge>
					</>}
					actions={<>
						<Button icon="tune" className="px-6! py-3! " onClick={navigate.settings}>Configure Settings</Button>
						<Button variant="primary" onClick={start} disabled={stage === 'starting'} icon={stage === 'idle' ? 'play_arrow' : 'refresh'} className="px-6! py-3! ">
							{stage === 'idle' ? 'Start Migration' : 'Initializing AST Scan...'}
						</Button>
					</>}
				/>
				<p className="mt-space-xs text-body-md font-body-md text-on-surface-variant max-w-2xl">{project.description}</p>
			</div>

			<div className="p-space-xl flex flex-col gap-space-lg w-full">
				<StepperNav screen="ready" />
				<div className="p-space-lg rounded-lg bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-space-md shadow-sm">
					<div className="flex items-start gap-space-md">
						<div className="p-3 rounded-lg bg-surface-container text-primary shrink-0">
							<Icon name="rocket_launch" className="text-[28px]" />
						</div>
						<div>
							<span className="text-[13px] uppercase tracking-wider text-secondary font-semibold">Pre-migration phase • Ready to initialize</span>
							<h2 className="text-headline-lg font-headline-lg mt-1">Initialize automated migration pipeline</h2>
							<p className="text-body-lg font-body-lg text-on-surface-variant max-w-4xl mt-1">
								Pre-flight checks have verified repository access, environment runtimes, and transformation engine readiness. Click <strong className="text-on-surface font-semibold">Start Migration</strong> to begin the first step, code analysis and dependency extraction.
							</p>
						</div>
					</div>
					<span className="text-[13px] text-outline shrink-0">ESTIMATED CYCLE: 18-24 MIN</span>
				</div>
			</div>
		</div>
	);
}

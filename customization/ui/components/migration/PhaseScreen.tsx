'use client';

import { useState } from 'react';
import { Badge, Button, Icon, Panel } from '@/components/ui';
import { nextScreen, screenDef, screenIndex, STEP_DEFS, type ScreenKey } from '@/features/migration/steps';
import type { Project } from '@/features/migration/types';
import { useMigration } from '@/state/MigrationProvider';
import { useNavigate } from '@/state/useNavigate';
import { PlanSummary } from './PlanSummary';
import { STEP_VIEWS } from './steps';
import { StepHeader } from './steps/StepHeader';
import { StepActionsSlotContext } from './steps/StepNav';
import { AskPanel } from './shell/AskPanel';
import { ScreenHeader } from './shell/ScreenHeader';
import { StepperNav } from './shell/StepperNav';

/**
 * Frame shared by all step screens: top bar (Ask, step actions, Proceed) and stepper.
 * Steps registered in STEP_VIEWS render their own content; the rest show a placeholder (milestones M3-M11).
 */
export function PhaseScreen({ screen, project }: { screen: Exclude<ScreenKey, 'ready'>; project: Project }) {
	const { go, reached } = useMigration();
	const navigate = useNavigate();
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	const [askOpen, setAskOpen] = useState(false);
	const [canContinue, setCanContinue] = useState(true);
	const [stopped, setStopped] = useState(false);
	const [runKey, setRunKey] = useState(0);
	const def = screenDef(screen);
	const step = STEP_DEFS[def.step];
	const next = nextScreen(screen);
	const done = def.kind === 'done';
	const nextStep = done ? STEP_DEFS[def.step + 1] : undefined;
	const summary = screen === 'summary';
	const StepView = summary ? undefined : STEP_VIEWS[step.slug];
	// A built running screen advances by itself when its work finishes.
	const autoAdvances = !!StepView && !done;
	// Revisiting a phase whose next one was already reached: no need to proceed again, the stepper navigates.
	// The last phase is the exception: it keeps its "View Plan Summary" button, as the summary has no stepper entry.
	const nextReached = !!next && !!nextStep && reached >= screenIndex(next);

	return (
		<StepActionsSlotContext.Provider value={slot}>
			<div className="flex w-full items-start">
			<div className="flex flex-col flex-1 min-w-0 p-space-lg space-y-space-lg text-on-surface">
				<ScreenHeader
					title={project.name}
					badges={<Badge className={done ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary-container/20 text-secondary'}>{summary ? 'Plan complete' : done ? `${step.label} complete` : 'In progress'}</Badge>}
					trail={[`${project.name} Workspace`, 'Migration', summary ? 'Plan Summary' : step.label]}
					actions={<>
						<Button icon="tune" className="px-6! py-3!" onClick={navigate.settings} title="Settings">Settings</Button>
						<Button icon="forum" className="px-6! py-3!" onClick={() => setAskOpen(true)}>Ask Mode</Button>
						<div ref={setSlot} className="contents" />
						{next && !autoAdvances && !nextReached && (
							<Button variant="primary" className="px-6! py-3!" onClick={() => go(next)} disabled={!canContinue}>
								{nextStep ? `Proceed to Step ${def.step + 2}: ${nextStep.label}` : 'View Plan Summary'}
								<Icon name="arrow_forward" className="text-[16px]" />
							</Button>
						)}
					</>}
				/>
				<StepperNav screen={screen} />
				{summary
					? <PlanSummary project={project} />
					: StepView && stopped
					? (
						<Panel icon="stop_circle" iconClass="text-error" title={`${step.label} stopped`}>
							<p className="text-body-md font-body-md text-on-surface-variant">The run was stopped and nothing from it was kept. Run this step again when you are ready.</p>
							<div className="flex gap-space-sm pt-space-sm">
								<Button variant="primary" icon="replay" onClick={() => { setStopped(false); setRunKey(key => key + 1); }}>Run Again</Button>
								{def.step > 0 && <Button icon="arrow_back" onClick={() => go(`${STEP_DEFS[def.step - 1].slug}-done`)}>Back to Step {def.step}</Button>}
							</div>
						</Panel>
					)
					: StepView
					? <StepView key={runKey} project={project} kind={done ? 'done' : 'running'} onGate={setCanContinue} onStop={() => setStopped(true)} />
					: (
						<>
							<StepHeader
								step={def.step}
								title={step.label}
								description="This step is not built yet. It will be added in a later milestone; navigation and state already work."
								badge={<Badge className="bg-surface-container text-on-surface-variant">Coming soon</Badge>}
							/>
							<Panel icon="construction" iconClass="text-secondary" title={`Step ${def.step + 1} of ${STEP_DEFS.length} · ${step.label}`}>
								<p className="text-body-md font-body-md text-on-surface-variant">Nothing to show here yet.</p>
							</Panel>
						</>
					)}
			</div>
			{askOpen && <AskPanel title="Migration" onClose={() => setAskOpen(false)} />}
			</div>
		</StepActionsSlotContext.Provider>
	);
}

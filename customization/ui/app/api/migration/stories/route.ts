import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { adaptStories } from '@/lib/server/adapters/stories';
import { connectDB } from '@/lib/server/db';
import { Milestone } from '@/lib/server/models/Milestone';
import { StoryPlan } from '@/lib/server/models/StoryPlan';
import { resetStories } from '@/lib/server/phaseReset';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfAnyRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';
import { generateMilestoneStories } from '@/lib/server/storyPipeline';

export const dynamic = 'force-dynamic';

const PHASE = 'stories';

/** `?projectId=`. The stored stories and tasks in the Stories step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const plans = await StoryPlan.find({ projectId: resolved.project.id }).lean();
		return Response.json(adaptStories(plans, await lastRunInfo(resolved.project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId }`. Writes the stories and tasks of every milestone in a run; needs the milestone plan locked. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	try {
		const busy = await rejectIfAnyRunning(project.id, PHASE);
		if (busy) {
			return busy;
		}
		const runId = await startRun({
			phase: PHASE,
			projectId: project.id,
			exec: async (run) => {
				const milestones = await Milestone.find({ projectId: project.id }).sort({ milestoneId: 1 }).lean();
				if (milestones.length === 0 || milestones.some(m => !m.locked)) {
					throw new StepPrerequisiteError('Lock the milestone plan first.');
				}
				// A re-run starts from nothing: the old stories and tasks, old runs and files go before Claude is called.
				await resetStories(project, run.runId);
				let stories = 0;
				for (const [index, milestone] of milestones.entries()) {
					const written = await generateMilestoneStories(run, project, milestone, fraction => (index + fraction) / milestones.length * 0.98);
					stories += written.length;
				}
				await run.log('progress', `Wrote ${stories} stories across ${milestones.length} milestones.`, 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

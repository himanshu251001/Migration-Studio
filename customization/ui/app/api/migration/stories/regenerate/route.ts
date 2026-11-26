import { connectDB } from '@/lib/server/db';
import { Milestone } from '@/lib/server/models/Milestone';
import { deletePhaseRuns, resetMilestoneStories } from '@/lib/server/phaseReset';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfAnyRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';
import { generateMilestoneStories, regenerateStoryTasks } from '@/lib/server/storyPipeline';

export const dynamic = 'force-dynamic';

/** Body `{ projectId, milestoneId, storyId? }`. Rewrites a milestone's stories and tasks, or only the tasks of one of its stories, in a run. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; milestoneId?: unknown; storyId?: unknown } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	const { milestoneId, storyId } = body ?? {};
	if (typeof milestoneId !== 'string' || !/^M-\d{2,6}$/.test(milestoneId) || (storyId !== undefined && (typeof storyId !== 'string' || !/^US-M-\d{2,6}-\d{1,6}$/.test(storyId)))) {
		return Response.json({ error: 'A valid milestoneId (and storyId) is required.' }, { status: 400 });
	}
	const phase = typeof storyId === 'string' ? `stories:${milestoneId}:${storyId}` : `stories:${milestoneId}`;
	try {
		await connectDB();
		const milestone = await Milestone.findOne({ projectId: project.id, milestoneId }).lean();
		if (!milestone) {
			return Response.json({ error: 'Milestone not found.' }, { status: 404 });
		}
		// The stories of a project share one stored plan per milestone, so only one write at a time.
		const busy = await rejectIfAnyRunning(project.id, 'stories');
		if (busy) {
			return busy;
		}
		const runId = await startRun({
			phase,
			projectId: project.id,
			exec: async (run) => {
				if (!milestone.locked) {
					throw new StepPrerequisiteError('Lock the milestone plan first.');
				}
				if (typeof storyId === 'string') {
					await deletePhaseRuns(project.id, phase, run.runId);
					if (!await regenerateStoryTasks(run, project, milestone, storyId)) {
						throw new StepPrerequisiteError('That story is not in the plan. Rewrite the milestone first.');
					}
					return;
				}
				await resetMilestoneStories(project, milestoneId, run.runId);
				const written = await generateMilestoneStories(run, project, milestone, fraction => fraction * 0.98);
				await run.log('progress', `Wrote ${written.length} stories for ${milestoneId}.`, 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

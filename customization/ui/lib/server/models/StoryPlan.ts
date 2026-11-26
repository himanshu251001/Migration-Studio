import { Schema, model, models, type Model } from 'mongoose';
import type { StoryReviewResult, StoryWithTasks } from '../stories';

/** The stories, tasks and reviews written for one milestone. One per project and milestone. */
export interface StoryPlanDoc {
	projectId: string;
	milestoneId: string;
	stories: StoryWithTasks[];
	/** `null` when the review did not run or failed; it is advisory and never blocks anything. */
	storyReview: StoryReviewResult | null;
	/** Whether Claude wrote the stories or the deterministic rule did. */
	storySource: 'claude' | 'deterministic';
	runId: string;
}

const StoryPlanSchema = new Schema<StoryPlanDoc>({
	projectId: { type: String, required: true },
	milestoneId: { type: String, required: true },
	stories: { type: Schema.Types.Mixed, default: [] },
	storyReview: { type: Schema.Types.Mixed, default: null },
	storySource: { type: String, enum: ['claude', 'deterministic'], required: true },
	runId: { type: String, default: '' }
}, { timestamps: true });

StoryPlanSchema.index({ projectId: 1, milestoneId: 1 }, { unique: true });

export const StoryPlan: Model<StoryPlanDoc> = (models.StoryPlan as Model<StoryPlanDoc> | undefined) ?? model<StoryPlanDoc>('StoryPlan', StoryPlanSchema);

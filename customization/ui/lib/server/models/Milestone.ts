import { Schema, model, models, type Model } from 'mongoose';
import type { MilestoneDeepAnalysis } from '../milestones';

/** One milestone of the plan, with the reviewer's rename and lock and its optional deep analysis. */
export interface MilestoneDoc {
	projectId: string;
	/** Id shown in the UI, `M-01` and so on, fixed in execution order when the plan is drafted. */
	milestoneId: string;
	wave: number;
	/** The drafted name. */
	name: string;
	description: string;
	/** Names of the migration units and shared services the milestone delivers. */
	unitRefs: string[];
	/** Ids of earlier milestones this one depends on. */
	dependencies: string[];
	estimatedEffort: string;
	/** Whether Claude drafted the plan or the deterministic per-wave rule did. */
	source: 'claude' | 'deterministic';
	/** The reviewer's name for the milestone; `null` keeps the drafted name. */
	renamedTo: string | null;
	locked: boolean;
	deepAnalysis: MilestoneDeepAnalysis | null;
	deepAnalysisGeneratedAt: Date | null;
	runId: string;
}

const MilestoneSchema = new Schema<MilestoneDoc>({
	projectId: { type: String, required: true },
	milestoneId: { type: String, required: true },
	wave: { type: Number, required: true },
	name: { type: String, required: true },
	description: { type: String, default: '' },
	unitRefs: { type: [String], default: [] },
	dependencies: { type: [String], default: [] },
	estimatedEffort: { type: String, default: '' },
	source: { type: String, enum: ['claude', 'deterministic'], required: true },
	renamedTo: { type: String, default: null },
	locked: { type: Boolean, default: false },
	deepAnalysis: { type: Schema.Types.Mixed, default: null },
	deepAnalysisGeneratedAt: { type: Date, default: null },
	runId: { type: String, default: '' }
}, { timestamps: true });

MilestoneSchema.index({ projectId: 1, milestoneId: 1 }, { unique: true });

export const Milestone: Model<MilestoneDoc> = (models.Milestone as Model<MilestoneDoc> | undefined) ?? model<MilestoneDoc>('Milestone', MilestoneSchema);

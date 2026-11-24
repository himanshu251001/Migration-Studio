import { Schema, model, models, type Model } from 'mongoose';
import type { Dimensions } from '../discovery';

export interface SubProjectAnalysisDoc {
	/** `Project.id` of the migration project. */
	projectId: string;
	/** Sub-project folder relative to the source folder (`.` for the root). */
	subProjectPath: string;
	manifestType: string;
	dimensions: Dimensions;
	filesScanned: number;
	runId: string;
	updatedAt: Date;
}

const SubProjectAnalysisSchema = new Schema<SubProjectAnalysisDoc>({
	projectId: { type: String, required: true },
	subProjectPath: { type: String, required: true },
	manifestType: { type: String, required: true },
	// The shape is enforced by the Claude JSON schema, so it is stored as received.
	dimensions: { type: Schema.Types.Mixed, required: true },
	filesScanned: { type: Number, default: 0 },
	runId: { type: String, default: '' }
}, { timestamps: true });

SubProjectAnalysisSchema.index({ projectId: 1, subProjectPath: 1 }, { unique: true });

export const SubProjectAnalysis: Model<SubProjectAnalysisDoc> = (models.SubProjectAnalysis as Model<SubProjectAnalysisDoc> | undefined) ?? model<SubProjectAnalysisDoc>('SubProjectAnalysis', SubProjectAnalysisSchema);

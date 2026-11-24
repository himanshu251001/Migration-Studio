import { Schema, model, models, type Model } from 'mongoose';
import type { StrategyReport } from '../decompositionStrategy';

export interface DecompositionStrategyReportDoc {
	/** `Project.id` of the migration project. One report per project. */
	projectId: string;
	report: StrategyReport;
	/** The reviewer's locked choice: an option id, or `other` with `custom` text. */
	lockedOptionId: string | null;
	lockedCustom: string | null;
	lockedAt: Date | null;
	runId: string;
}

const DecompositionStrategyReportSchema = new Schema<DecompositionStrategyReportDoc>({
	projectId: { type: String, required: true, unique: true },
	report: { type: Schema.Types.Mixed, required: true },
	lockedOptionId: { type: String, default: null },
	lockedCustom: { type: String, default: null },
	lockedAt: { type: Date, default: null },
	runId: { type: String, default: '' }
}, { timestamps: true });

export const DecompositionStrategyReport: Model<DecompositionStrategyReportDoc> = (models.DecompositionStrategyReport as Model<DecompositionStrategyReportDoc> | undefined) ?? model<DecompositionStrategyReportDoc>('DecompositionStrategyReport', DecompositionStrategyReportSchema);

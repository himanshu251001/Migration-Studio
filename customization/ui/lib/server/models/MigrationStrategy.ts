import { Schema, model, models, type Model } from 'mongoose';
import type { MigrationStrategyData } from '../migrationStrategy';

/** The Rollout step's strategy and the reviewer's sign-off. One per project. */
export interface MigrationStrategyDoc {
	projectId: string;
	strategy: MigrationStrategyData;
	/** Whether Claude wrote the strategy or the deterministic rule did. */
	source: 'claude' | 'deterministic';
	/** What the strategy was drawn for, to show in the file and the cards. */
	targetStackName: string;
	architectureOption: string;
	unitCount: number;
	locked: boolean;
	lockedAt: Date | null;
	runId: string;
}

const MigrationStrategySchema = new Schema<MigrationStrategyDoc>({
	projectId: { type: String, required: true, unique: true },
	strategy: { type: Schema.Types.Mixed, required: true },
	source: { type: String, enum: ['claude', 'deterministic'], required: true },
	targetStackName: { type: String, required: true },
	architectureOption: { type: String, required: true },
	unitCount: { type: Number, default: 0 },
	locked: { type: Boolean, default: false },
	lockedAt: { type: Date, default: null },
	runId: { type: String, default: '' }
}, { timestamps: true });

export const MigrationStrategy: Model<MigrationStrategyDoc> = (models.MigrationStrategy as Model<MigrationStrategyDoc> | undefined) ?? model<MigrationStrategyDoc>('MigrationStrategy', MigrationStrategySchema);

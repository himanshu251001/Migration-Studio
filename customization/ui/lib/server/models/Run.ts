import { Schema, model, models, type Model } from 'mongoose';
import type { RunStatus } from '@/features/migration/runs';

export interface RunEventDoc {
	type: string;
	message: string;
	timestamp: Date;
	progress?: number;
}

export interface RunDoc {
	/** `Project.id` of the migration project (a folder path, possibly with a `#key` suffix). */
	projectId: string;
	/** Free text on purpose: each step defines its own phase names. */
	phase: string;
	params: Record<string, unknown>;
	status: RunStatus;
	events: RunEventDoc[];
	completedAt: Date | null;
	createdAt: Date;
}

const RunEventSchema = new Schema<RunEventDoc>({
	type: { type: String, required: true },
	message: { type: String, required: true },
	timestamp: { type: Date, default: Date.now },
	progress: { type: Number }
}, { _id: false });

const RunSchema = new Schema<RunDoc>({
	projectId: { type: String, required: true, index: true },
	phase: { type: String, required: true },
	params: { type: Schema.Types.Mixed, default: {} },
	status: { type: String, enum: ['running', 'completed', 'failed', 'cancelled'], default: 'running' },
	events: { type: [RunEventSchema], default: [] },
	completedAt: { type: Date, default: null }
}, { timestamps: true });

export const Run: Model<RunDoc> = (models.Run as Model<RunDoc> | undefined) ?? model<RunDoc>('Run', RunSchema);

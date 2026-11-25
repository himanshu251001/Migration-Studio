import { Schema, model, models, type Model } from 'mongoose';
import type { MappingEntry } from '../mapping';

/** The Target step's mapping library and the reviewer's approvals. One per project. */
export interface TargetMappingDoc {
	projectId: string;
	sourceStack: string;
	/** Name of the target stack the mappings were drawn for. */
	targetStackName: string;
	entries: MappingEntry[];
	/** Whether Claude drafted the entries or the deterministic rule did. */
	source: 'claude' | 'deterministic';
	/** Categories the reviewer approved. */
	approved: string[];
	runId: string;
}

const TargetMappingSchema = new Schema<TargetMappingDoc>({
	projectId: { type: String, required: true, unique: true },
	sourceStack: { type: String, required: true },
	targetStackName: { type: String, required: true },
	entries: { type: Schema.Types.Mixed, required: true },
	source: { type: String, enum: ['claude', 'deterministic'], required: true },
	approved: { type: [String], default: [] },
	runId: { type: String, default: '' }
}, { timestamps: true });

export const TargetMapping: Model<TargetMappingDoc> = (models.TargetMapping as Model<TargetMappingDoc> | undefined) ?? model<TargetMappingDoc>('TargetMapping', TargetMappingSchema);

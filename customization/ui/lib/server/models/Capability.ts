import { Schema, model, models, type Model } from 'mongoose';
import type { CapabilityDeepAnalysis } from '../capabilities';

export interface CapabilityDoc {
	/** `Project.id` of the migration project. */
	projectId: string;
	/** Stable number within the project; the capability id shown in the UI is `cap-<seqNum>`. */
	seqNum: number;
	domain: string;
	name: string;
	description: string;
	businessOutcome: string;
	personas: string[];
	frequency: 'High' | 'Medium' | 'Low';
	criticality: 'Critical' | 'High' | 'Medium' | 'Low';
	primaryProjects: string[];
	/** Names of other capabilities this one depends on. */
	dependencies: string[];
	notes: string;
	/** The on-demand deep analysis, stored as received; `null` until generated. */
	deepAnalysis: CapabilityDeepAnalysis | null;
	deepAnalysisGeneratedAt: Date | null;
	runId: string;
}

const CapabilitySchema = new Schema<CapabilityDoc>({
	projectId: { type: String, required: true },
	seqNum: { type: Number, required: true },
	domain: { type: String, required: true },
	name: { type: String, required: true },
	description: { type: String, default: '' },
	businessOutcome: { type: String, default: '' },
	personas: { type: [String], default: [] },
	frequency: { type: String, enum: ['High', 'Medium', 'Low'], required: true },
	criticality: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], required: true },
	primaryProjects: { type: [String], default: [] },
	dependencies: { type: [String], default: [] },
	notes: { type: String, default: '' },
	deepAnalysis: { type: Schema.Types.Mixed, default: null },
	deepAnalysisGeneratedAt: { type: Date, default: null },
	runId: { type: String, default: '' }
}, { timestamps: true });

CapabilitySchema.index({ projectId: 1, seqNum: 1 }, { unique: true });

export const Capability: Model<CapabilityDoc> = (models.Capability as Model<CapabilityDoc> | undefined) ?? model<CapabilityDoc>('Capability', CapabilitySchema);

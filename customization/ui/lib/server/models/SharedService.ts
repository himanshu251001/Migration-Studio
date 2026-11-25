import { Schema, model, models, type Model } from 'mongoose';
import { dependencyFieldsDefinition, type DependencyFields } from './dependencyFields';

export interface SharedServiceDoc extends DependencyFields {
	projectId: string;
	seqNum: number;
	name: string;
	dependentCount: number;
	reason: string;
	runId: string;
}

const SharedServiceSchema = new Schema<SharedServiceDoc>({
	projectId: { type: String, required: true },
	seqNum: { type: Number, required: true },
	name: { type: String, required: true },
	dependentCount: { type: Number, required: true },
	reason: { type: String, default: '' },
	runId: { type: String, default: '' },
	...dependencyFieldsDefinition
}, { timestamps: true });

SharedServiceSchema.index({ projectId: 1, seqNum: 1 }, { unique: true });

export const SharedService: Model<SharedServiceDoc> = (models.SharedService as Model<SharedServiceDoc> | undefined) ?? model<SharedServiceDoc>('SharedService', SharedServiceSchema);

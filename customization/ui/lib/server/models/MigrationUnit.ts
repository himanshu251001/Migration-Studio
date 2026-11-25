import { Schema, model, models, type Model } from 'mongoose';
import { dependencyFieldsDefinition, type DependencyFields } from './dependencyFields';

export interface MigrationUnitDoc extends DependencyFields {
	projectId: string;
	/** Id shown in the UI, `UNIT-01` and so on, fixed when the units are grouped. */
	unitId: string;
	name: string;
	domain: string;
	capabilities: { seqNum: number; name: string }[];
	sharedServicesConsumed: string[];
	dependenciesOnOtherUnits: { unitName: string; reason: string }[];
	scopeEstimate: 'Small' | 'Medium' | 'Large';
	scopeRationale: string;
	/** The planner's suggested position. */
	plannerOrder: number;
	/** The reviewer's position; starts equal to `plannerOrder`. */
	order: number;
	locked: boolean;
	runId: string;
}

const MigrationUnitSchema = new Schema<MigrationUnitDoc>({
	projectId: { type: String, required: true },
	unitId: { type: String, required: true },
	name: { type: String, required: true },
	domain: { type: String, required: true },
	capabilities: { type: [{ _id: false, seqNum: Number, name: String }], default: [] },
	sharedServicesConsumed: { type: [String], default: [] },
	dependenciesOnOtherUnits: { type: [{ _id: false, unitName: String, reason: String }], default: [] },
	scopeEstimate: { type: String, enum: ['Small', 'Medium', 'Large'], required: true },
	scopeRationale: { type: String, default: '' },
	plannerOrder: { type: Number, required: true },
	order: { type: Number, required: true },
	locked: { type: Boolean, default: false },
	runId: { type: String, default: '' },
	...dependencyFieldsDefinition
}, { timestamps: true });

MigrationUnitSchema.index({ projectId: 1, unitId: 1 }, { unique: true });

export const MigrationUnit: Model<MigrationUnitDoc> = (models.MigrationUnit as Model<MigrationUnitDoc> | undefined) ?? model<MigrationUnitDoc>('MigrationUnit', MigrationUnitSchema);

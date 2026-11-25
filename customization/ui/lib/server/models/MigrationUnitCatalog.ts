import { Schema, model, models, type Model } from 'mongoose';

export interface UnitDeviation { unitName: string; decompositionRecommendation: string; actualGrouping: string; reason: string }
export interface CohesionIssue { unitName: string; criterion: string; issue: string; recommendation: string }

/** What the unit grouping run learned beyond the units themselves; feeds the catalog Markdown. One per project. */
export interface MigrationUnitCatalogDoc {
	projectId: string;
	groupingLabel: string;
	deviations: UnitDeviation[];
	cohesionIssues: CohesionIssue[];
	unanalyzedCapabilities: { seqNum: number; name: string; domain: string }[];
}

const MigrationUnitCatalogSchema = new Schema<MigrationUnitCatalogDoc>({
	projectId: { type: String, required: true, unique: true },
	groupingLabel: { type: String, default: 'Domain' },
	deviations: { type: Schema.Types.Mixed, default: [] },
	cohesionIssues: { type: Schema.Types.Mixed, default: [] },
	unanalyzedCapabilities: { type: Schema.Types.Mixed, default: [] }
}, { timestamps: true });

export const MigrationUnitCatalog: Model<MigrationUnitCatalogDoc> = (models.MigrationUnitCatalog as Model<MigrationUnitCatalogDoc> | undefined) ?? model<MigrationUnitCatalogDoc>('MigrationUnitCatalog', MigrationUnitCatalogSchema);

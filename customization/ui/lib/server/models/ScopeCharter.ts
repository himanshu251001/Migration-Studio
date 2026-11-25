import { Schema, model, models, type Model } from 'mongoose';
import type { CharterData } from '../charter';
import type { GapRecord } from '../gapAnalysis';

/** A target stack candidate as stored with the charter, so the list stays stable between reloads. */
export interface StoredStackCandidate {
	id: string;
	name: string;
	architecture: string;
	description: string;
	tradeoff: string;
}

/** What a gap analysis is tied to: the reviewer's stack, database and rollout strategy. */
export interface GapSelection {
	stack: string;
	customStack: string | null;
	database: string;
	strategy: string;
}

/** The Scope step's draft and the reviewer's choices. One per project. */
export interface ScopeCharterDoc {
	projectId: string;
	charter: CharterData;
	/** Whether Claude wrote the charter or the deterministic rule did. */
	charterSource: 'claude' | 'deterministic';
	candidates: StoredStackCandidate[];
	/** The gaps, each with an id (`GAP-01`) fixed when they were found. Empty until the gap analysis ran for the current selection. */
	gaps: (GapRecord & { gapId: string })[];
	/** The selection the gap analysis ran against; `null` when it has not run, or was discarded because the selection changed. */
	gapSelection: GapSelection | null;
	/** The reviewer's choices. */
	stack: string | null;
	customStack: string | null;
	database: string;
	strategy: string;
	/** Chosen resolution text per gap id. */
	resolutions: Record<string, string>;
	locked: boolean;
	lockedAt: Date | null;
	runId: string;
}

const ScopeCharterSchema = new Schema<ScopeCharterDoc>({
	projectId: { type: String, required: true, unique: true },
	charter: { type: Schema.Types.Mixed, required: true },
	charterSource: { type: String, enum: ['claude', 'deterministic'], required: true },
	candidates: { type: Schema.Types.Mixed, default: [] },
	gaps: { type: Schema.Types.Mixed, default: [] },
	gapSelection: { type: Schema.Types.Mixed, default: null },
	stack: { type: String, default: null },
	customStack: { type: String, default: null },
	database: { type: String, required: true },
	strategy: { type: String, required: true },
	resolutions: { type: Schema.Types.Mixed, default: {} },
	locked: { type: Boolean, default: false },
	lockedAt: { type: Date, default: null },
	runId: { type: String, default: '' }
}, { timestamps: true, minimize: false });

export const ScopeCharter: Model<ScopeCharterDoc> = (models.ScopeCharter as Model<ScopeCharterDoc> | undefined) ?? model<ScopeCharterDoc>('ScopeCharter', ScopeCharterSchema);

import type { ScopeDecision } from '@/features/migration/scope';
import { scopeDecisionOf } from '@/lib/server/adapters/scope';
import { buildCharterMarkdown } from '@/lib/server/charter';
import { connectDB } from '@/lib/server/db';
import { ScopeCharter } from '@/lib/server/models/ScopeCharter';
import { deleteScopeGapRuns, resetTarget } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { resolveStepProject, runRouteError } from '@/lib/server/stepRoute';
import { DATABASE_OPTIONS, ROLLOUT_STRATEGIES } from '@/lib/server/targetCatalog';

export const dynamic = 'force-dynamic';

const MAX_TEXT_LENGTH = 2000;

/** `?projectId=`. The reviewer's choices, or `null` before the scope was drafted. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		return Response.json({ decision: scopeDecisionOf(await ScopeCharter.findOne({ projectId: resolved.project.id }).lean()) });
	} catch (error) {
		return runRouteError(error);
	}
}

function isText(value: unknown, required: boolean): value is string {
	return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH && (!required || value.trim().length > 0);
}

/**
 * Body `{ projectId, decision }`. Saves the choices. The gaps are tied to the stack, database and strategy they were analyzed
 * for: a different selection discards them and their resolutions. With `locked` the stack must be chosen, the gap analysis
 * must be ready for exactly this selection, and every gap resolved. Changing a lock clears the Target and Rollout built on it.
 */
export async function PUT(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; decision?: Partial<ScopeDecision> } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const decision = body?.decision;
	if (!decision || typeof decision.locked !== 'boolean' || !isText(decision.database, true) || !isText(decision.strategy, true)
		|| (decision.stack !== undefined && !isText(decision.stack, true)) || (decision.customStack !== undefined && !isText(decision.customStack, false))
		|| typeof decision.resolutions !== 'object' || decision.resolutions === null || Array.isArray(decision.resolutions)) {
		return Response.json({ error: 'Expected { decision: { stack?, customStack?, database, strategy, resolutions, locked } }.' }, { status: 400 });
	}
	try {
		await connectDB();
		const doc = await ScopeCharter.findOne({ projectId: resolved.project.id });
		if (!doc) {
			return Response.json({ error: 'Draft the scope before choosing a stack.' }, { status: 409 });
		}
		const customStack = decision.stack === 'other' ? decision.customStack?.trim() ?? null : null;
		// The gaps belong to the selection they were analyzed for; any other selection makes them (and the resolutions) stale.
		const analyzed = doc.gapSelection;
		if (analyzed && (analyzed.stack !== (decision.stack ?? null) || analyzed.customStack !== customStack || analyzed.database !== decision.database || analyzed.strategy !== decision.strategy)) {
			doc.gaps = [];
			doc.gapSelection = null;
			doc.markModified('gaps');
			await deleteScopeGapRuns(resolved.project.id);
		}
		const gapIds = new Set(doc.gaps.map(gap => gap.gapId));
		// Only text for gaps that exist is kept, so the stored resolutions cannot grow with arbitrary keys.
		const resolutions: Record<string, string> = {};
		for (const [gapId, text] of Object.entries(decision.resolutions)) {
			if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) {
				return Response.json({ error: 'Each resolution must be text of up to 2000 characters.' }, { status: 400 });
			}
			if (gapIds.has(gapId) && text.trim()) {
				resolutions[gapId] = text;
			}
		}
		if (decision.stack && decision.stack !== 'other' && !doc.candidates.some(c => c.id === decision.stack)) {
			return Response.json({ error: 'Unknown target stack.' }, { status: 400 });
		}
		if (decision.locked) {
			if (!decision.stack || (decision.stack === 'other' && !decision.customStack?.trim())) {
				return Response.json({ error: 'Choose a target stack before locking it.' }, { status: 409 });
			}
			if (!doc.gapSelection) {
				return Response.json({ error: 'Analyze the gaps for this target stack before locking it.' }, { status: 409 });
			}
			if (doc.gaps.some(gap => !resolutions[gap.gapId])) {
				return Response.json({ error: 'Resolve every gap before locking the target stack.' }, { status: 409 });
			}
		}
		// A different stack, database or strategy than the one Target and Rollout were built on makes them stale.
		const changed = doc.locked && (!decision.locked || doc.stack !== (decision.stack ?? null) || doc.customStack !== customStack || doc.database !== decision.database || doc.strategy !== decision.strategy);
		if (doc.locked && !changed && decision.locked) {
			// Same lock again: nothing to change.
			return Response.json({ ok: true });
		}
		doc.stack = decision.stack ?? null;
		doc.customStack = customStack;
		doc.database = decision.database;
		doc.strategy = decision.strategy;
		doc.resolutions = resolutions;
		doc.markModified('resolutions');
		doc.locked = decision.locked;
		doc.lockedAt = decision.locked ? new Date() : null;
		await doc.save();
		if (changed) {
			await resetTarget(resolved.project);
		}
		// The charter file names the locked stack once there is one.
		const chosen = decision.stack === 'other' ? customStack : doc.candidates.find(c => c.id === decision.stack)?.name;
		await writeProjectFile(resolved.project.dest, 'migration/modernization-charter.md', buildCharterMarkdown(doc.charter, decision.locked && chosen ? { name: chosen, architecture: decision.stack === 'other' ? 'custom' : doc.candidates.find(c => c.id === decision.stack)?.architecture ?? 'custom' } : undefined));
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

/** `?projectId=`. Forgets the choices, the lock and the gap analysis (back to the defaults) and the Target and Rollout built on them. */
export async function DELETE(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const doc = await ScopeCharter.findOne({ projectId: resolved.project.id });
		if (doc) {
			doc.stack = null;
			doc.customStack = null;
			doc.database = DATABASE_OPTIONS[0];
			doc.strategy = ROLLOUT_STRATEGIES[0];
			doc.resolutions = {};
			doc.gaps = [];
			doc.gapSelection = null;
			doc.markModified('resolutions');
			doc.markModified('gaps');
			doc.locked = false;
			doc.lockedAt = null;
			await doc.save();
			await deleteScopeGapRuns(resolved.project.id);
		}
		await resetTarget(resolved.project);
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

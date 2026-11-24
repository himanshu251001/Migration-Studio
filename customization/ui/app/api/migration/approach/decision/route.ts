import type { ApproachDecision } from '@/features/migration/approach';
import { strategyOptionId } from '@/lib/server/adapters/approach';
import { connectDB } from '@/lib/server/db';
import { DecompositionStrategyReport } from '@/lib/server/models/DecompositionStrategyReport';
import { resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

const MAX_CUSTOM_LENGTH = 2000;

/** `?projectId=`. The locked strategy, or `null`. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const stored = await DecompositionStrategyReport.findOne({ projectId: resolved.project.id }).lean();
		const decision: ApproachDecision | null = stored?.lockedOptionId
			? { optionId: stored.lockedOptionId, ...(stored.lockedCustom ? { custom: stored.lockedCustom } : {}) }
			: null;
		return Response.json({ decision });
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId, decision }`. Locks one of the evaluated options, or a custom strategy. */
export async function PUT(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; decision?: { optionId?: unknown; custom?: unknown } } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const optionId = body?.decision?.optionId;
	const custom = body?.decision?.custom;
	if (typeof optionId !== 'string' || (custom !== undefined && typeof custom !== 'string')) {
		return Response.json({ error: 'Expected { decision: { optionId, custom? } }.' }, { status: 400 });
	}
	try {
		await connectDB();
		const stored = await DecompositionStrategyReport.findOne({ projectId: resolved.project.id });
		if (!stored) {
			return Response.json({ error: 'Evaluate the strategies before locking one.' }, { status: 409 });
		}
		if (optionId === 'other') {
			if (!custom?.trim() || custom.length > MAX_CUSTOM_LENGTH) {
				return Response.json({ error: 'Describe the custom strategy (up to 2000 characters).' }, { status: 400 });
			}
		} else if (!stored.report.strategyComparison.some(entry => strategyOptionId(entry.strategy) === optionId)) {
			return Response.json({ error: 'Unknown strategy.' }, { status: 400 });
		}
		stored.lockedOptionId = optionId;
		stored.lockedCustom = optionId === 'other' ? custom!.trim() : null;
		stored.lockedAt = new Date();
		await stored.save();
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

/** `?projectId=`. Forgets the lock. Nothing is built on the strategy yet, so there is no downstream data to clear. */
export async function DELETE(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		await DecompositionStrategyReport.updateOne({ projectId: resolved.project.id }, { $set: { lockedOptionId: null, lockedCustom: null, lockedAt: null } });
		return Response.json({ ok: true });
	} catch (error) {
		return runRouteError(error);
	}
}

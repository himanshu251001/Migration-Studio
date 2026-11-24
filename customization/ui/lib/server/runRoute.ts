import { isValidObjectId } from 'mongoose';
import { DatabaseUnavailableError } from './db';
import { isSameOrigin } from './sameOrigin';

/** Shared guard for the run routes: same-origin only, and the id must look like a Mongo id. */
export function guardRunRequest(request: Request, id?: string): Response | undefined {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	if (id !== undefined && !isValidObjectId(id)) {
		return Response.json({ error: 'Run not found.' }, { status: 404 });
	}
	return undefined;
}

/** Maps an unexpected route failure to a fixed-text response. */
export function runRouteError(error: unknown): Response {
	// After a first successful connection, a dropped Mongo surfaces as driver errors rather than ours.
	if (error instanceof DatabaseUnavailableError || (error instanceof Error && /^Mongo/.test(error.name))) {
		return Response.json({ error: new DatabaseUnavailableError().message }, { status: 503 });
	}
	return Response.json({ error: 'The request failed.' }, { status: 500 });
}

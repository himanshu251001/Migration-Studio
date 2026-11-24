import { readSettings, SettingsError, toPublic, updateSettings } from '@/lib/server/settings';
import { isSameOrigin } from '@/lib/server/sameOrigin';

export const dynamic = 'force-dynamic';

/** Returns the settings with the Mongo password hidden. */
export async function GET(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	return Response.json({ settings: toPublic(await readSettings()) });
}

/** Body: any subset of the settings. Returns the saved settings (Mongo password hidden). */
export async function PUT(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}
	const body = await request.json().catch(() => undefined) as Record<string, unknown> | undefined;
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return Response.json({ error: 'Expected a settings object.' }, { status: 400 });
	}
	try {
		return Response.json({ settings: toPublic(await updateSettings(body)) });
	} catch (error) {
		if (error instanceof SettingsError) {
			return Response.json({ error: error.message }, { status: 400 });
		}
		throw error;
	}
}

import mongoose from 'mongoose';
import { readSettings } from './settings';

interface MongooseCache {
	conn: typeof mongoose | null;
	promise: Promise<typeof mongoose> | null;
	uri: string | null;
	orphanSweepDone: boolean;
}

declare global {
	var _migrationStudioMongoose: MongooseCache | undefined;
}

// Survives Next.js dev-mode module reloads, like the other process-wide singletons in lib/server.
const cache: MongooseCache = globalThis._migrationStudioMongoose ?? { conn: null, promise: null, uri: null, orphanSweepDone: false };
globalThis._migrationStudioMongoose = cache;

/** Thrown when MongoDB cannot be reached; fixed text so no connection string leaks. */
export class DatabaseUnavailableError extends Error {
	constructor() {
		super('MongoDB is unreachable. Check that it is running and the URI in Settings is correct.');
	}
}

/** Connects once per process (and again if the URI in Settings changed). */
export async function connectDB(): Promise<typeof mongoose> {
	const { mongoUri } = await readSettings();
	if (cache.conn && cache.uri !== mongoUri) {
		await mongoose.disconnect().catch(() => undefined);
		cache.conn = null;
		cache.promise = null;
		cache.orphanSweepDone = false;
	}
	if (!cache.conn) {
		cache.promise ??= mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
		try {
			cache.conn = await cache.promise;
			cache.uri = mongoUri;
		} catch {
			// Do not cache the rejection: one failed attempt must not break every later request.
			cache.promise = null;
			throw new DatabaseUnavailableError();
		}
	}
	await reconcileOrphanedRuns();
	return cache.conn;
}

/**
 * A run still `running` when this process boots is orphaned: the in-memory registry and the executor that would
 * finish it are gone. Fail it once per process so it cannot block its step forever.
 */
async function reconcileOrphanedRuns(): Promise<void> {
	if (cache.orphanSweepDone) {
		return;
	}
	cache.orphanSweepDone = true;
	const { Run } = await import('./models/Run');
	await Run.updateMany(
		{ status: 'running' },
		{
			$set: { status: 'failed', completedAt: new Date() },
			$push: { events: { type: 'error', message: 'Marked failed: the server restarted while this run was in progress.', timestamp: new Date() } }
		}
	);
}

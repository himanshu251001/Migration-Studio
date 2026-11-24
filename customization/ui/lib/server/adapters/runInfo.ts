import { connectDB } from '../db';
import { Run } from '../models/Run';

/** What the UI shows about a step's last finished run: log lines and a human readable duration. */
export interface LastRunInfo {
	logs: string[];
	duration: string;
}

function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

/** The newest completed run of `phase` for the project, or empty info when there is none. */
export async function lastRunInfo(projectId: string, phase: string): Promise<LastRunInfo> {
	await connectDB();
	const run = await Run.findOne({ projectId, phase, status: 'completed' }).sort({ createdAt: -1 }).lean();
	if (!run) {
		return { logs: [], duration: '' };
	}
	const end = run.completedAt ?? new Date(run.createdAt);
	return {
		logs: run.events.map(event => `[${event.type.toUpperCase()}] ${event.message}`),
		duration: formatDuration(end.getTime() - new Date(run.createdAt).getTime())
	};
}

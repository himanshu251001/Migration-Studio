import type { TrackerPushResult } from '@/features/migration/tracker';
import type { TrackerService } from '../types';

/** Pushes through this app's own API route, which holds the token only for the duration of the request. */
export class HttpTrackerService implements TrackerService {
	async push(request: Parameters<TrackerService['push']>[0], signal: AbortSignal): Promise<TrackerPushResult> {
		const response = await fetch('/api/tracker/push', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(request),
			signal
		});
		const data = await response.json().catch(() => ({})) as Partial<TrackerPushResult> & { error?: string };
		if (!response.ok || !data.milestones || !data.stories || !data.failures) {
			throw new Error(data.error ?? `Request failed (${response.status}).`);
		}
		return { milestones: data.milestones, stories: data.stories, failures: data.failures };
	}
}

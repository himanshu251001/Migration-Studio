import { milestoneDescription, storyIssueBody, trackerMarker, type CreatedItem, type PushFailure, type TrackerPushResult } from '@/features/migration/tracker';
import type { BacklogMilestone } from '@/features/migration/stories';

const API = 'https://api.github.com';

class AuthError extends Error { }

interface GitHubObject { readonly number: number; readonly html_url: string; readonly title: string; readonly body?: string | null }

async function call<T>(token: string, method: string, url: string, body?: unknown): Promise<T> {
	const response = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'Content-Type': 'application/json',
			'User-Agent': 'migration-studio'
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		cache: 'no-store'
	});
	if (response.status === 401 || response.status === 403 || response.status === 404) {
		// 404 is what GitHub returns for a private repo the token cannot see.
		throw new AuthError(`GitHub refused the request (${response.status}). Check the token's access to the repository.`);
	}
	if (!response.ok) {
		throw new Error(`GitHub request failed (${response.status}).`);
	}
	return await response.json() as T;
}

/** Lists every page of `path`, so existing markers are found even in large repositories. */
async function listAll(token: string, path: string): Promise<GitHubObject[]> {
	const all: GitHubObject[] = [];
	for (let page = 1; page <= 20; page++) {
		const sep = path.includes('?') ? '&' : '?';
		const items = await call<GitHubObject[]>(token, 'GET', `${API}${path}${sep}per_page=100&page=${page}`);
		all.push(...items);
		if (items.length < 100) {
			break;
		}
	}
	return all;
}

/** Creates the milestones and story issues in `repo`. Items whose marker already exists are reported as existing. */
export async function pushToGitHub(token: string, repo: string, plan: readonly BacklogMilestone[]): Promise<TrackerPushResult> {
	const milestones: CreatedItem[] = [];
	const stories: CreatedItem[] = [];
	const failures: PushFailure[] = [];
	const existingMilestones = await listAll(token, `/repos/${repo}/milestones?state=all`);
	const existingIssues = (await listAll(token, `/repos/${repo}/issues?state=all`)).filter(i => i.body);

	for (const m of plan) {
		let number: number | undefined;
		try {
			const found = existingMilestones.find(e => e.body?.includes(trackerMarker(m.id)));
			const title = `${m.id}: ${m.name}`;
			const item = found ?? await call<GitHubObject>(token, 'POST', `${API}/repos/${repo}/milestones`, { title, description: milestoneDescription(m) });
			number = item.number;
			milestones.push({ id: m.id, title, url: item.html_url, existing: !!found });
		} catch (e) {
			if (e instanceof AuthError) {
				throw e;
			}
			failures.push({ id: m.id, message: e instanceof Error ? e.message : 'Failed.' });
			continue;
		}
		for (const s of m.stories) {
			try {
				const found = existingIssues.find(i => i.body?.includes(trackerMarker(s.id)));
				const issue = found ?? await call<GitHubObject>(token, 'POST', `${API}/repos/${repo}/issues`, { title: `${s.id}: ${s.title}`, body: storyIssueBody(s), milestone: number });
				stories.push({ id: s.id, title: s.title, url: issue.html_url, existing: !!found });
			} catch (e) {
				if (e instanceof AuthError) {
					throw e;
				}
				failures.push({ id: s.id, message: e instanceof Error ? e.message : 'Failed.' });
			}
		}
	}
	return { milestones, stories, failures };
}

export { AuthError };

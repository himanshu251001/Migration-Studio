import type { Project, ProjectDraft } from '@/features/migration/types';
import type { ProjectService } from '../types';


async function post<T>(url: string, body: unknown): Promise<T> {
	const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
	const data = await response.json().catch(() => ({})) as T & { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? `Request failed (${response.status}).`);
	}
	return data;
}

/** Detects and creates projects through this app's own API, which reads/writes `.migration-studio/project.json` on disk. */
export class HttpProjectService implements ProjectService {
	async detectProjects(folders: readonly string[]): Promise<readonly Project[]> {
		return (await post<{ projects: Project[] }>('/api/projects/detect', { folders })).projects;
	}

	async createDraft(): Promise<ProjectDraft> {
		return { name: '', description: '', source: '', dest: '' };
	}

	async createProject(folder: string, draft: ProjectDraft): Promise<Project> {
		return (await post<{ project: Project }>('/api/projects/create', { folder, draft })).project;
	}
}

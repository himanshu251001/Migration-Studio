import type { ArtifactRef } from '@/features/migration/analyze';
import type { ReviewComment } from '@/features/migration/comments';
import type { Project } from '@/features/migration/types';
import type { ArtifactService } from '../types';

/** Writes artifacts through this app's own API, which stores them under `<dest>/.migration/artifacts/`. */
export class HttpArtifactService implements ArtifactService {
	async materialize(project: Project, artifact: ArtifactRef): Promise<string> {
		const response = await fetch('/api/artifacts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dest: project.dest, path: artifact.path, content: artifact.content })
		});
		const data = await response.json().catch(() => ({})) as { path?: string; error?: string };
		if (!response.ok || !data.path) {
			throw new Error(data.error ?? `Request failed (${response.status}).`);
		}
		return data.path;
	}

	async getComments(project: Project): Promise<readonly ReviewComment[]> {
		const response = await fetch(`/api/artifacts/comments?dest=${encodeURIComponent(project.dest)}`, { cache: 'no-store' });
		const data = await response.json().catch(() => ({})) as { comments?: ReviewComment[]; error?: string };
		if (!response.ok || !data.comments) {
			throw new Error(data.error ?? `Request failed (${response.status}).`);
		}
		return data.comments;
	}

	async markCommentsSent(project: Project, ids: readonly string[]): Promise<void> {
		const response = await fetch('/api/artifacts/comments', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dest: project.dest, ids })
		});
		if (!response.ok) {
			throw new Error(`Request failed (${response.status}).`);
		}
	}
}

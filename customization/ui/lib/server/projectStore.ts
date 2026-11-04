import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Project, ProjectDraft } from '@/features/migration/types';

/**
 * Where project definitions are kept: inside this Next.js app (never in the opened repo), one JSON file per opened folder.
 * Temporary home until a proper store exists; override with MIGRATION_STUDIO_DATA_DIR.
 */
const DATA_DIR = process.env.MIGRATION_STUDIO_DATA_DIR ?? path.join(process.cwd(), '.data', 'projects');

interface ProjectFile {
	name?: unknown;
	description?: unknown;
	source?: unknown;
	dest?: unknown;
}

/** Thrown for problems the caller caused (bad input); the route turns these into 4xx responses. */
export class ProjectStoreError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
	}
}

async function isDirectory(dir: string): Promise<boolean> {
	return stat(dir).then(s => s.isDirectory(), () => false);
}

function folderKey(folder: string): string {
	return createHash('sha1').update(path.resolve(folder)).digest('hex');
}

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

/** Reads one stored project file. The first project of a folder is `<key>.json`; further ones are `<key>-<slug>.json`. */
async function readProjectFile(folder: string, file: string, primary: boolean): Promise<Project | undefined> {
	let data: ProjectFile;
	try {
		data = JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf8')) as ProjectFile;
	} catch {
		return undefined;
	}
	if (typeof data.name !== 'string' || !data.name.trim() || typeof data.source !== 'string' || typeof data.dest !== 'string') {
		return undefined;
	}
	const root = path.resolve(folder);
	return {
		id: primary ? root : `${root}#${file.slice(0, -'.json'.length)}`,
		name: data.name.trim(),
		description: typeof data.description === 'string' ? data.description : '',
		source: path.resolve(folder, data.source),
		dest: path.resolve(folder, data.dest)
	};
}

/** Reads every project stored for the opened `folder` (none when there are none or all are malformed). */
async function readProjects(folder: string): Promise<Project[]> {
	const key = folderKey(folder);
	const files = await readdir(DATA_DIR).catch(() => [] as string[]);
	const projects = await Promise.all(files
		.filter(f => f === `${key}.json` || (f.startsWith(`${key}-`) && f.endsWith('.json')))
		.map(f => readProjectFile(folder, f, f === `${key}.json`)));
	return projects.filter((p): p is Project => !!p);
}

/** Finds the projects belonging to the opened folders. */
export async function detectProjects(folders: readonly string[]): Promise<Project[]> {
	const found: Project[] = [];
	for (const folder of folders) {
		if (path.isAbsolute(folder)) {
			found.push(...await readProjects(folder));
		}
	}
	return [...new Map(found.map(p => [p.id, p])).values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Creates the project for `folder` (an opened folder), stored in this app's data directory. */
export async function createProject(folder: string, draft: ProjectDraft): Promise<Project> {
	const name = draft.name.trim();
	if (!path.isAbsolute(folder) || !await isDirectory(folder)) {
		throw new ProjectStoreError('The opened folder does not exist.', 400);
	}
	if (!name || !draft.source.trim() || !draft.dest.trim()) {
		throw new ProjectStoreError('Name, source and destination are required.', 400);
	}
	const existing = await readProjects(folder);
	if (existing.some(p => p.name.toLowerCase() === name.toLowerCase())) {
		throw new ProjectStoreError('This folder already has a migration project with that name.', 409);
	}
	const key = folderKey(folder);
	const file = existing.length === 0 ? `${key}.json` : `${key}-${slugify(name)}.json`;
	await mkdir(DATA_DIR, { recursive: true });
	await writeFile(path.join(DATA_DIR, file), JSON.stringify({ folder: path.resolve(folder), name, description: draft.description, source: draft.source.trim(), dest: draft.dest.trim() }, null, '\t') + '\n');
	const project = await readProjectFile(folder, file, existing.length === 0);
	if (!project) {
		throw new ProjectStoreError('The project could not be saved.', 500);
	}
	return project;
}

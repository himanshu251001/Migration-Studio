import { mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Thrown when a path would leave the project folder; fixed text, never echoes the path. */
export class WorkspacePathError extends Error {
	constructor() {
		super('The path is outside the project folder.');
	}
}

/** Lowercase, dash-separated name safe to use as a file name. */
export function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function isInside(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Resolves the deepest existing ancestor through symlinks, then re-appends the not-yet-created tail. */
async function realpathOfPossiblyMissing(target: string): Promise<string> {
	const tail: string[] = [];
	let current = target;
	for (; ;) {
		try {
			return path.join(await realpath(current), ...tail.reverse());
		} catch {
			const parent = path.dirname(current);
			if (parent === current) {
				throw new WorkspacePathError();
			}
			tail.push(path.basename(current));
			current = parent;
		}
	}
}

/**
 * Resolves `relative` under `root`, following symlinks, and refuses anything that lands outside `root`.
 * `root` is the migration destination folder; it is created when missing.
 */
export async function resolveInsideRoot(root: string, relative: string): Promise<string> {
	if (relative.includes('\0') || path.isAbsolute(relative)) {
		throw new WorkspacePathError();
	}
	await mkdir(root, { recursive: true });
	const realRoot = await realpath(root);
	const target = await realpathOfPossiblyMissing(path.resolve(realRoot, relative));
	if (!isInside(realRoot, target)) {
		throw new WorkspacePathError();
	}
	return target;
}

/** Writes a text file under `<root>/<relative>`, creating folders. Returns the absolute path written. */
export async function writeProjectFile(root: string, relative: string, content: string): Promise<string> {
	const file = await resolveInsideRoot(root, relative);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, content, 'utf8');
	return file;
}

/** Removes a file or folder under `<root>/<relative>`; a missing target is fine. Refuses paths outside `root`. */
export async function removeProjectPath(root: string, relative: string): Promise<void> {
	const target = await resolveInsideRoot(root, relative);
	await rm(target, { recursive: true, force: true });
}

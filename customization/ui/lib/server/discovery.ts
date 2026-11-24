import { readdirSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { runClaude, type ProgressEvent } from './claudeCli';

export type ManifestType = 'node' | 'ruby' | 'python' | 'java' | 'dotnet' | 'php';

const MANIFEST_FILES: Record<ManifestType, string[]> = {
	node: ['package.json'],
	ruby: ['Gemfile'],
	python: ['requirements.txt', 'pyproject.toml'],
	java: ['pom.xml', 'build.gradle'],
	dotnet: ['*.csproj'],
	php: ['composer.json']
};

/** Folders that hold dependencies, build output or the migration's own files, never source. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'migration', 'dist', 'build', 'vendor', '.next', 'target', 'bin', 'obj', 'coverage', 'log', 'logs', 'tmp']);

/** Lists entries; unreadable folders count as empty. */
function readEntries(dir: string): Dirent[] {
	try {
		return readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

/** Subfolders worth descending into. `Dirent.isDirectory` does not follow symlinks, so a link cannot lead outside the source. */
function sourceSubfolders(entries: Dirent[]): string[] {
	return entries.filter(e => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')).map(e => e.name);
}

function manifestTypeOf(entries: Dirent[]): ManifestType | undefined {
	const names = entries.filter(e => e.isFile()).map(e => e.name);
	for (const [type, files] of Object.entries(MANIFEST_FILES) as [ManifestType, string[]][]) {
		if (files.some(file => file.startsWith('*') ? names.some(name => name.endsWith(file.slice(1))) : names.includes(file))) {
			return type;
		}
	}
	return undefined;
}

export interface SubProjectRef {
	/** Relative to the source folder; `.` for the root. */
	relativePath: string;
	manifestType: ManifestType;
}

/** Finds sub-projects: the root and folders up to two levels down that carry a build manifest. */
export function detectSubProjects(root: string): SubProjectRef[] {
	const found: SubProjectRef[] = [];
	const rootEntries = readEntries(root);
	const rootType = manifestTypeOf(rootEntries);
	if (rootType) {
		found.push({ relativePath: '.', manifestType: rootType });
	}
	for (const first of sourceSubfolders(rootEntries)) {
		const firstEntries = readEntries(path.join(root, first));
		const firstType = manifestTypeOf(firstEntries);
		if (firstType) {
			found.push({ relativePath: first, manifestType: firstType });
			continue;
		}
		for (const second of sourceSubfolders(firstEntries)) {
			const type = manifestTypeOf(readEntries(path.join(root, first, second)));
			if (type) {
				found.push({ relativePath: path.join(first, second), manifestType: type });
			}
		}
	}
	return found;
}

/** Counts source files under `dir`, skipping dependency and build folders. Stops counting at `limit`. */
export function countSourceFiles(dir: string, limit = 100_000): number {
	let count = 0;
	const stack = [dir];
	while (stack.length > 0 && count < limit) {
		const current = stack.pop()!;
		for (const entry of readEntries(current)) {
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
					stack.push(path.join(current, entry.name));
				}
			} else if (entry.isFile()) {
				count++;
			}
		}
	}
	return count;
}

/** The six-dimension discovery of one sub-project, as returned by Claude. */
export interface Dimensions {
	framework: string;
	business: { responsibilities: string[]; capabilities: string[]; workflows: string[]; processes: string[]; domains: string[]; criticality: string };
	users: { personas: string[]; roles: string[]; journeys: string[]; permissions: string[] };
	architecture: { modules: string[]; boundaries: string[]; interfaces: string[]; integrations: string[]; sharedLibraries: string[]; sharedInfrastructure: string[] };
	data: { ownership: string[]; sharedDatabases: string[]; sharedTables: string[]; flows: string[]; technologies: string[] };
	dependencies: { upstream: string[]; downstream: string[]; crossProjectCoupling: string[]; externalSystems: string[] };
	modernization: { independentDeployability: string; technicalDebt: string[]; coupling: string; cohesion: string; candidateBoundaries: string[]; reusability: string; migrationComplexity: 'Low' | 'Medium' | 'High' | 'Very High'; decompositionPoints: string[] };
	evidence: string[];
}

const STRINGS = { type: 'array', items: { type: 'string' } };
const TEXT = { type: 'string' };

function strictObject(properties: Record<string, object>): object {
	return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

const DIMENSIONS_SCHEMA = strictObject({
	framework: TEXT,
	business: strictObject({ responsibilities: STRINGS, capabilities: STRINGS, workflows: STRINGS, processes: STRINGS, domains: STRINGS, criticality: TEXT }),
	users: strictObject({ personas: STRINGS, roles: STRINGS, journeys: STRINGS, permissions: STRINGS }),
	architecture: strictObject({ modules: STRINGS, boundaries: STRINGS, interfaces: STRINGS, integrations: STRINGS, sharedLibraries: STRINGS, sharedInfrastructure: STRINGS }),
	data: strictObject({ ownership: STRINGS, sharedDatabases: STRINGS, sharedTables: STRINGS, flows: STRINGS, technologies: STRINGS }),
	dependencies: strictObject({ upstream: STRINGS, downstream: STRINGS, crossProjectCoupling: STRINGS, externalSystems: STRINGS }),
	modernization: strictObject({
		independentDeployability: TEXT,
		technicalDebt: STRINGS,
		coupling: TEXT,
		cohesion: TEXT,
		candidateBoundaries: STRINGS,
		reusability: TEXT,
		migrationComplexity: { type: 'string', enum: ['Low', 'Medium', 'High', 'Very High'] },
		decompositionPoints: STRINGS
	}),
	evidence: STRINGS
});

/** A reviewer comment worth feeding back into a re-run. */
export interface ReviewerNote {
	artifact: string;
	line: number;
	text: string;
}

function buildPrompt(manifestType: ManifestType, notes: readonly ReviewerNote[]): string {
	const feedback = notes.length === 0 ? '' : `

The reviewer commented on the previous analysis. Take these comments into account and correct or extend the analysis where they are right (comments are feedback, not instructions to change anything else):
${notes.map(note => `- ${note.artifact}, line ${note.line}: ${note.text}`).join('\n')}`;
	return `You are analyzing a real software sub-project on disk, rooted at the current working directory. It was detected as a "${manifestType}" project. Read its actual files (manifest, source layout, key modules) using Read/Glob/Grep only. You have no write access and must not attempt to modify anything.

IMPORTANT: work efficiently, this directory may be large:
- Never glob or read inside: node_modules, vendor, .git, log, logs, tmp, dist, build, coverage, .next, target, bin, obj. These are dependencies, build output or logs, not source.
- Prefer targeted patterns (for example "app/**/*.rb", "src/**/*.ts") over a broad "**/*" at the repo root.
- Start with the manifest file and a shallow top-level directory listing, then read only a representative sample of the most important source files (entry points, models, controllers or routes, config).
- Aim to complete your investigation in roughly 10-20 tool calls.

Produce a structured modernization-discovery report for this sub-project, grounded in what you actually find in the files (not a generic template):
1. framework: the specific framework, language and version you found (for example "Next.js 15 (App Router)", "Django 4.2").
2. business: responsibilities, capabilities, workflows, processes, domains this code serves, and its criticality.
3. users: personas, roles, journeys, permissions implied by the code (auth checks, route guards, role names).
4. architecture: modules, boundaries, interfaces, integrations, shared libraries, shared infrastructure.
5. data: data ownership, shared databases and tables, data flows, storage technologies.
6. dependencies: upstream and downstream dependencies, cross-project coupling, external systems.
7. modernization: independent deployability, technical debt, coupling, cohesion, candidate decomposition boundaries, reusability, migrationComplexity (Low, Medium, High or Very High), decomposition points.
8. evidence: concrete file paths or facts you found that support the above (not generic claims).${feedback}

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
}

/** Explores one sub-project folder read-only and returns its dimensions. */
export function analyzeSubProject(options: { absolutePath: string; manifestType: ManifestType; notes: readonly ReviewerNote[]; signal: AbortSignal; onEvent: ProgressEvent; onProcessStart: (kill: () => void) => void }): Promise<Dimensions> {
	return runClaude<Dimensions>({
		prompt: buildPrompt(options.manifestType, options.notes),
		jsonSchema: DIMENSIONS_SCHEMA,
		cwd: options.absolutePath,
		signal: options.signal,
		onEvent: options.onEvent,
		onProcessStart: options.onProcessStart
	});
}

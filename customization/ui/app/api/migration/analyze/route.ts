import path from 'node:path';
import { adaptAnalysis, analysisArtifacts, type StoredAnalysis } from '@/lib/server/adapters/analysis';
import { lastRunInfo } from '@/lib/server/adapters/runInfo';
import { connectDB } from '@/lib/server/db';
import { analyzeSubProject, countSourceFiles, detectSubProjects, type ReviewerNote } from '@/lib/server/discovery';
import { SubProjectAnalysis } from '@/lib/server/models/SubProjectAnalysis';
import { resetAnalyze } from '@/lib/server/phaseReset';
import { writeProjectFile } from '@/lib/server/projectWorkspace';
import { startRun } from '@/lib/server/runner';
import { StepPrerequisiteError } from '@/lib/server/stepErrors';
import { rejectIfRunning, resolveStepProject, runRouteError } from '@/lib/server/stepRoute';

export const dynamic = 'force-dynamic';

const PHASE = 'analyze';
const MAX_NOTES = 50;
const MAX_NOTE_LENGTH = 1000;

/** Keeps only well-formed reviewer comments, bounded in number and size. */
function parseNotes(value: unknown): ReviewerNote[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.slice(0, MAX_NOTES).flatMap((item: { artifact?: unknown; line?: unknown; text?: unknown }) =>
		typeof item?.artifact === 'string' && typeof item.line === 'number' && typeof item.text === 'string' && item.text.trim()
			? [{ artifact: item.artifact.slice(0, 200), line: item.line, text: item.text.slice(0, MAX_NOTE_LENGTH) }]
			: []);
}

/** `?projectId=`. The stored analysis in the Analyze step's shape, or an empty skeleton before the first run. */
export async function GET(request: Request): Promise<Response> {
	const resolved = await resolveStepProject(request, new URL(request.url).searchParams.get('projectId'));
	if ('response' in resolved) {
		return resolved.response;
	}
	try {
		await connectDB();
		const stored = await SubProjectAnalysis.find({ projectId: resolved.project.id }).sort({ subProjectPath: 1 }).lean();
		const items: StoredAnalysis[] = stored.map(doc => ({ subProjectPath: doc.subProjectPath, manifestType: doc.manifestType, dimensions: doc.dimensions, filesScanned: doc.filesScanned }));
		return Response.json(adaptAnalysis(items, await lastRunInfo(resolved.project.id, PHASE)));
	} catch (error) {
		return runRouteError(error);
	}
}

/** Body `{ projectId, comments? }`. Starts the analysis run and answers 202 with the run id. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.json().catch(() => undefined) as { projectId?: unknown; comments?: unknown } | undefined;
	const resolved = await resolveStepProject(request, body?.projectId);
	if ('response' in resolved) {
		return resolved.response;
	}
	const { project } = resolved;
	const notes = parseNotes(body?.comments);
	try {
		const busy = await rejectIfRunning(project.id, PHASE);
		if (busy) {
			return busy;
		}
		const runId = await startRun({
			phase: PHASE,
			projectId: project.id,
			exec: async ({ runId: id, signal, log, onProcessStart }) => {
				const subProjects = detectSubProjects(project.source);
				if (subProjects.length === 0) {
					throw new StepPrerequisiteError('No sub-projects with a build manifest were found in the source folder.');
				}
				// A re-run starts from nothing: the old findings, files and the Approach built on them go.
				await resetAnalyze(project, id);
				// The four tasks on screen each own a quarter of the bar: scan, Claude exploring, review, report.
				await log('progress', 'Scanning source files…', 0.02);
				const fileCounts = subProjects.map(sub => countSourceFiles(path.resolve(project.source, sub.relativePath)));
				await log('progress', `Found ${subProjects.length} sub-project(s), ${fileCounts.reduce((sum, n) => sum + n, 0).toLocaleString('en-US')} source file(s).`, 0.25);
				const span = 0.5 / subProjects.length;
				for (const [index, sub] of subProjects.entries()) {
					const start = 0.25 + index * span;
					await log('progress', `Analyzing ${sub.relativePath} (${sub.manifestType}) with Claude (read-only)`, start);
					const absolutePath = path.resolve(project.source, sub.relativePath);
					// Every Claude action nudges the bar forward, easing towards (never reaching) the end of this sub-project's share.
					let steps = 0;
					const dimensions = await analyzeSubProject({
						absolutePath, manifestType: sub.manifestType, notes, signal, onProcessStart,
						onEvent: (type, message) => {
							steps++;
							void log(type, message, start + span * 0.95 * (1 - 1 / (1 + steps / 12)));
						}
					});
					await log('progress', `Reviewing findings for ${sub.relativePath}`, start + span * 0.97);
					await SubProjectAnalysis.updateOne(
						{ projectId: project.id, subProjectPath: sub.relativePath },
						{ $set: { manifestType: sub.manifestType, dimensions, filesScanned: fileCounts[index], runId: id } },
						{ upsert: true }
					);
					await log('progress', `Finished ${sub.relativePath}`, start + span);
				}
				await log('progress', 'Generating the analysis report…', 0.75);
				const stored = await SubProjectAnalysis.find({ projectId: project.id }).sort({ subProjectPath: 1 }).lean();
				const artifacts = analysisArtifacts(stored.map(doc => ({ subProjectPath: doc.subProjectPath, manifestType: doc.manifestType, dimensions: doc.dimensions, filesScanned: doc.filesScanned })));
				for (const [index, artifact] of artifacts.entries()) {
					await writeProjectFile(project.dest, `migration/discovery/${artifact.path}`, artifact.content);
					await log('progress', `Wrote ${artifact.name}`, 0.75 + 0.24 * (index + 1) / artifacts.length);
				}
				await log('progress', 'Wrote the discovery reports.', 1);
			}
		});
		return Response.json({ runId }, { status: 202 });
	} catch (error) {
		return runRouteError(error);
	}
}

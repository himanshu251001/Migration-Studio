import type { AnalysisResult, AnalyzeTask, DiscoveryRow, DiscoveryTone } from '@/features/migration/analyze';
import type { Dimensions } from '../discovery';
import { buildDiscoveryIndexMarkdown, buildSubProjectMarkdown } from '../discoveryMarkdown';
import type { LastRunInfo } from './runInfo';

/** One stored sub-project analysis. */
export interface StoredAnalysis {
	subProjectPath: string;
	manifestType: string;
	dimensions: Dimensions;
	filesScanned: number;
}

const TASKS: readonly Pick<AnalyzeTask, 'label' | 'description'>[] = [
	{ label: 'Scanning source files', description: 'Locating sub-projects and counting source files' },
	{ label: 'Invoking Claude (read-only) for analysis', description: 'Reading manifests and key modules of each sub-project' },
	{ label: 'Reviewing the codebase', description: 'Find patterns, dependencies and risks' },
	{ label: 'Generating analysis report', description: 'Create summary of architectural findings' }
];

const COMPLEXITY_RANK = ['Low', 'Medium', 'High', 'Very High'] as const;

function unique(values: readonly string[]): string[] {
	return [...new Set(values.filter(value => value.trim()))];
}

function complexityTone(complexity: string): DiscoveryTone {
	return complexity === 'High' || complexity === 'Very High' ? 'danger' : complexity === 'Medium' ? 'warning' : 'neutral';
}

/** The analysis markdown files, also written to the destination repo. */
export function analysisArtifacts(items: readonly StoredAnalysis[]): { name: string; path: string; content: string }[] {
	return [
		{ name: 'discovery-index.md', path: 'discovery-index.md', content: buildDiscoveryIndexMarkdown(items) },
		...items.map(item => {
			const slug = item.subProjectPath === '.' ? 'root' : item.subProjectPath.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
			return { name: `discovery-${slug}.md`, path: `discovery-${slug}.md`, content: buildSubProjectMarkdown(item.subProjectPath, item.dimensions) };
		})
	];
}

/** Before any run: the task list with zero counts, so the running screen has something to progress against. */
export function emptyAnalysis(): AnalysisResult {
	return {
		tasks: TASKS.map(task => ({ ...task, doneMeta: '' })),
		logs: [], discovery: [], metrics: { filesScanned: 0, components: 0, risks: 0 }, blockers: '', artifacts: [], duration: '', errors: 0
	};
}

/** Maps the stored analyses of every sub-project to what the Analyze step shows. */
export function adaptAnalysis(items: readonly StoredAnalysis[], run: LastRunInfo): AnalysisResult {
	if (items.length === 0) {
		return emptyAnalysis();
	}
	const dims = items.map(item => item.dimensions);
	const filesScanned = items.reduce((sum, item) => sum + item.filesScanned, 0);
	const components = dims.reduce((sum, d) => sum + d.architecture.modules.length, 0);
	const debt = dims.flatMap(d => d.modernization.technicalDebt);
	const risks = debt.length;
	const worst = dims.map(d => d.modernization.migrationComplexity).sort((a, b) => COMPLEXITY_RANK.indexOf(b) - COMPLEXITY_RANK.indexOf(a))[0];
	const criticality = unique(dims.map(d => d.business.criticality));
	const artifacts = analysisArtifacts(items);
	const discovery: DiscoveryRow[] = [
		{ key: 'Sub-projects', value: items.map(item => item.subProjectPath === '.' ? '(root)' : item.subProjectPath).join(', ') },
		{ key: 'Framework', value: unique(dims.map(d => d.framework)).join('; ') || 'Not identified' },
		{ key: 'Domains', value: unique(dims.flatMap(d => d.business.domains)).join(', ') || 'None found' },
		{ key: 'Criticality', value: criticality.join('; ') || 'Not assessed' },
		{ key: 'Migration complexity', value: worst, tone: complexityTone(worst) },
		{ key: 'Technical debt', value: `${risks} item(s)`, tone: risks > 10 ? 'danger' : risks > 0 ? 'warning' : 'neutral' }
	];
	const blockers = debt.length > 0
		? unique(items.flatMap(item => item.dimensions.modernization.technicalDebt.map(d => `${d} (${item.subProjectPath})`))).join(' ')
		: 'No blockers or technical debt were reported.';
	const meta = [`${filesScanned.toLocaleString('en-US')} files`, `${items.length} sub-project(s)`, `${risks} risks flagged`, `${artifacts.length} files`];
	return {
		tasks: TASKS.map((task, index) => ({ ...task, doneMeta: meta[index] })),
		logs: run.logs,
		discovery,
		metrics: { filesScanned, components, risks },
		blockers,
		artifacts: [
			{ id: 'discovery-index', icon: 'data_object', name: 'discovery-index.md', meta: `Index of ${items.length} sub-project(s)`, path: 'discovery-index.md', content: artifacts[0].content },
			...artifacts.slice(1).map((artifact, index) => ({ id: `discovery-${index}`, icon: 'description', name: artifact.name, meta: items[index].manifestType, path: artifact.path, content: artifact.content }))
		],
		duration: run.duration,
		errors: 0
	};
}

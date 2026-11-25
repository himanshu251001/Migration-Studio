import { runClaude, runClaudeSynthesis } from './claudeCli';
import { DECOMPOSITION_STRATEGIES } from './decompositionStrategy';
import type { Dimensions } from './discovery';
import { slugify } from './projectWorkspace';
import { StepPrerequisiteError } from './stepErrors';

/** How capabilities are grouped under a locked strategy: the label, the document title and the instruction to Claude. */
interface StrategyDimension {
	groupingLabel: string;
	indexDocTitle: string;
	promptGuidance: string;
}

const FALLBACK_DIMENSION: StrategyDimension = {
	groupingLabel: 'Category',
	indexDocTitle: 'Capability Index',
	promptGuidance: 'No standard grouping dimension is defined for this custom strategy name; infer a sensible grouping dimension from the strategy name itself and group capabilities accordingly, explaining your inferred dimension in the notes field.'
};

const DIMENSIONS: Record<(typeof DECOMPOSITION_STRATEGIES)[number], StrategyDimension> = {
	'Persona-Based': { groupingLabel: 'Persona', indexDocTitle: 'Persona Capability Map', promptGuidance: 'Group each capability by the primary user persona who uses it (from users.personas), one entry per persona.' },
	'Module-Based': { groupingLabel: 'Module', indexDocTitle: 'Module Index', promptGuidance: 'Group each capability by the technical module or layer that implements it (from architecture.modules).' },
	'Capability-Based': { groupingLabel: 'Domain', indexDocTitle: 'Business Capability Index', promptGuidance: 'Group each capability by its business domain (from business.domains). This is the default, business-language grouping.' },
	'Domain-Based (DDD)': { groupingLabel: 'Bounded Context', indexDocTitle: 'Bounded Context Index', promptGuidance: "Group each capability by the DDD bounded context it belongs to. Infer a bounded context name from business.domains and architecture.boundaries, using domain-driven-design naming (for example 'Identity Context', 'Billing Context'), not raw business.domains values verbatim." },
	'Business Process / Value Stream-Based': { groupingLabel: 'Value Stream', indexDocTitle: 'Value Stream Index', promptGuidance: 'Group each capability by the end-to-end business workflow or value stream it is part of (from business.workflows and business.processes).' },
	'Data Ownership-Based': { groupingLabel: 'Data Owner', indexDocTitle: 'Data Ownership Index', promptGuidance: 'Group each capability by the primary data entity or table cluster it owns or mutates (from data.ownership).' },
	'Event-Based': { groupingLabel: 'Domain Event', indexDocTitle: 'Event Index', promptGuidance: "Group each capability by the domain event that triggers it or that it emits. Infer a plausible event name (for example 'UserRegistered', 'OrderPlaced') from the capability's workflow, since discovery data does not capture events explicitly." },
	'API Consumer-Based': { groupingLabel: 'API Consumer', indexDocTitle: 'API Consumer Index', promptGuidance: "Group each capability by the external system or consumer that calls it (from dependencies.externalSystems and downstream). Use 'Internal UI' for capabilities with no external consumer." },
	'Risk-Based': { groupingLabel: 'Risk Tier', indexDocTitle: 'Risk-Ordered Capability Index', promptGuidance: "Group each capability by a risk tier ('Critical Risk', 'High Risk', 'Medium Risk' or 'Low Risk') inferred from modernization.technicalDebt and modernization.migrationComplexity of the owning sub-project." },
	'Team-Based': { groupingLabel: 'Owning Team', indexDocTitle: 'Team Ownership Index', promptGuidance: 'Group each capability by an inferred owning team. Discovery data has no real team information, so use the owning sub-project name or path as the team-ownership proxy, and say so in notes.' },
	'Deployment-Based': { groupingLabel: 'Deployment Unit', indexDocTitle: 'Deployment Unit Index', promptGuidance: 'Group each capability by the independent-deployability boundary it belongs to (from modernization.independentDeployability and candidateBoundaries).' },
	'Technology-Based': { groupingLabel: 'Technology Stack', indexDocTitle: 'Technology Stack Index', promptGuidance: 'Group each capability by the technology or framework of its owning sub-project (its framework and manifest type).' }
};

/** The grouping rules for a strategy name; a custom, reviewer-typed strategy gets the generic fallback. */
export function dimensionForStrategy(strategyName: string): StrategyDimension {
	return (DIMENSIONS as Record<string, StrategyDimension>)[strategyName] ?? FALLBACK_DIMENSION;
}

/** One capability as Claude returns it. */
export interface DerivedCapability {
	domain: string;
	name: string;
	description: string;
	businessOutcome: string;
	personas: string[];
	frequency: 'High' | 'Medium' | 'Low';
	criticality: 'Critical' | 'High' | 'Medium' | 'Low';
	primaryProjects: string[];
	dependencies: string[];
	notes: string;
}

/** A capability with its position in the index. */
export interface NumberedCapability extends DerivedCapability {
	seqNum: number;
}

const STRINGS = { type: 'array', items: { type: 'string' } };

const CAPABILITIES_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['capabilities'],
	properties: {
		capabilities: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['domain', 'name', 'description', 'businessOutcome', 'personas', 'frequency', 'criticality', 'primaryProjects', 'dependencies', 'notes'],
				properties: {
					domain: { type: 'string' },
					name: { type: 'string' },
					description: { type: 'string' },
					businessOutcome: { type: 'string' },
					personas: STRINGS,
					frequency: { type: 'string', enum: ['High', 'Medium', 'Low'] },
					criticality: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
					primaryProjects: STRINGS,
					dependencies: { type: 'array', items: { type: 'string' }, description: 'Names of OTHER capabilities in this same response that this one depends on; empty if none.' },
					notes: { type: 'string' }
				}
			}
		}
	}
};

/** One analyzed sub-project, as the capability prompt sees it. */
export interface AnalyzedSubProject {
	subProjectPath: string;
	dimensions: Dimensions;
}

function buildCapabilitiesPrompt(subProjects: readonly AnalyzedSubProject[], strategyName: string): string {
	const dimension = dimensionForStrategy(strategyName);
	const evidence = subProjects.map(s => ({ subProjectPath: s.subProjectPath, ...s.dimensions }));
	return `You are producing a Business Capability Index from sub-project discovery data. Ground every capability in the data below. Never invent one that is not traceable to business.capabilities, business.responsibilities, business.workflows, business.processes, or modernization.candidateBoundaries. Think critically. Do not add a capability the evidence does not support.

## Locked decomposition strategy
"${strategyName}". Every capability's "domain" field must be grouped according to this rule:
${dimension.promptGuidance}

## Sub-project analysis data (${subProjects.length} project(s), the ONLY source of truth)
${JSON.stringify(evidence, undefined, 2)}

---

## Capability discovery rules

**Sources to mine (in priority order):**
1. business.capabilities: explicit capability names from discovery; treat each as a candidate
2. business.responsibilities: what the project owns; surface distinct responsibilities as additional capabilities if not already represented
3. business.workflows and business.processes: end-to-end workflows reveal capabilities not named individually; extract discrete named steps that constitute business value
4. modernization.candidateBoundaries and modernization.decompositionPoints: natural cut points often indicate distinct capabilities
5. evidence array: direct observations from discovery; use to validate and ground frequency and criticality

**Deduplication:** Do NOT duplicate identical capability names across sub-projects. Merge them and list all relevant sub-projects in primaryProjects. Every capability name must be unique.

**Cross-cutting concern exclusion:** Authentication, session management, caching, logging, and general infrastructure are NOT capabilities unless they directly deliver measurable business value to an end user. Exclude them unless the data specifically describes them as a user-facing business function.

---

## Field-level instructions

**domain:** The grouping bucket per the locked-strategy rule above. NOT always a business domain.

**description and businessOutcome:** Must be specific to this capability and this repository. Reference the sub-project(s) and the actual domain bucket. No generic filler.

**personas:** Pull from the owning sub-project(s) users.personas and users.roles. If users.journeys describe how specific personas interact with this capability, reflect that in the description.

**frequency:** Classify as High, Medium or Low based on evidence, not a guess:
- High: the operation appears in users.journeys as a primary journey step, or is part of a business.workflows entry with clear daily or session-level usage
- Low: the operation appears only in business.processes (setup, config, admin, batch, one-time tasks)
- Medium: anything in between, or when the data is ambiguous

**criticality:** Infer from business.criticality, the sub-project's role in dependencies.downstream, and whether the capability appears on a primary user journey. Critical = the business cannot operate without it. Low = optional or nice-to-have.

**primaryProjects:** Use the exact subProjectPath values from the data above.

**dependencies:** Name real OTHER capability names from this same response that this one depends on. This feeds downstream shared-service detection: any capability named as a dependency by 3 or more other capabilities becomes a shared platform service. Be deliberate and realistic, and model the actual dependency structure, not an artificially sparse one.

**notes:** Leave as an empty string unless you had to infer a grouping value that is not explicitly in the data, or there is a genuine caveat worth recording.

---

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
}

/**
 * Cleans what Claude returned so later steps can rely on it: unique names (merged), dependencies that name a real other
 * capability, and sequence numbers from 1 in the model's order.
 */
function normalizeCapabilities(items: readonly DerivedCapability[]): NumberedCapability[] {
	const byName = new Map<string, DerivedCapability>();
	for (const item of items) {
		const name = item.name?.trim();
		if (!name) {
			continue;
		}
		const existing = byName.get(name);
		if (existing) {
			existing.primaryProjects = [...new Set([...existing.primaryProjects, ...(item.primaryProjects ?? [])])];
			existing.dependencies = [...new Set([...existing.dependencies, ...(item.dependencies ?? [])])];
		} else {
			byName.set(name, { ...item, name, domain: item.domain?.trim() || 'General', personas: item.personas ?? [], primaryProjects: item.primaryProjects ?? [], dependencies: item.dependencies ?? [], notes: item.notes ?? '' });
		}
	}
	return [...byName.values()].map((item, index) => ({
		...item,
		dependencies: [...new Set(item.dependencies)].filter(dependency => dependency !== item.name && byName.has(dependency)),
		seqNum: index + 1
	}));
}

/** Derives the capability index from the sub-project analyses, grouped by the locked strategy. Reasoning only, no file access. */
export async function deriveCapabilities(subProjects: readonly AnalyzedSubProject[], strategyName: string, signal: AbortSignal, onProcessStart: (kill: () => void) => void): Promise<NumberedCapability[]> {
	const result = await runClaudeSynthesis<{ capabilities: DerivedCapability[] }>({ prompt: buildCapabilitiesPrompt(subProjects, strategyName), jsonSchema: CAPABILITIES_SCHEMA, signal, onProcessStart });
	const capabilities = normalizeCapabilities(result.capabilities ?? []);
	if (capabilities.length === 0) {
		throw new StepPrerequisiteError('No capabilities could be derived from the analysis.');
	}
	return capabilities;
}

/** The capability index as a Markdown file for the destination repo. */
export function buildCapabilityIndexMarkdown(capabilities: readonly NumberedCapability[], strategyName: string): string {
	const dimension = dimensionForStrategy(strategyName);
	const lines: string[] = [`# ${dimension.indexDocTitle}`, '', `> **Decomposition Strategy:** ${strategyName}`, ''];
	const byDomain = new Map<string, NumberedCapability[]>();
	for (const capability of capabilities) {
		byDomain.set(capability.domain, [...(byDomain.get(capability.domain) ?? []), capability]);
	}
	for (const [domain, items] of byDomain) {
		lines.push(`## ${dimension.groupingLabel}: ${domain}`, '');
		for (const c of items) {
			lines.push(`### ${c.name}`, '', `**Description:** ${c.description}`, '', `**Business Outcome:** ${c.businessOutcome}`, '', `**Personas:** ${c.personas.join(', ') || 'None'}`, '', `**Frequency:** ${c.frequency}`, '', `**Criticality:** ${c.criticality}`, '', `**Primary Projects:** ${c.primaryProjects.join(', ') || 'None'}`, '', `**Dependencies:** ${c.dependencies.join(', ') || 'None'}`, '');
			if (c.notes) {
				lines.push(`**Notes:** ${c.notes}`, '');
			}
		}
	}
	lines.push('## Summary Table', '', `| # | ${dimension.groupingLabel} | Capability | Frequency | Criticality | Primary Projects |`, '|---|---|---|---|---|---|');
	for (const c of capabilities) {
		lines.push(`| ${c.seqNum} | ${c.domain} | ${c.name} | ${c.frequency} | ${c.criticality} | ${c.primaryProjects.join(', ')} |`);
	}
	lines.push('');
	return lines.join('\n');
}

/** Where one capability's deep analysis is written, relative to the destination folder. */
export function deepAnalysisFile(seqNum: number, name: string): string {
	return `migration/capabilities/${String(seqNum).padStart(2, '0')}-${slugify(name)}.md`;
}

/** The deep analysis of one capability, as Claude returns it. */
export interface CapabilityDeepAnalysis {
	workflowSteps: { step: string; description: string; businessRules: string[]; files: string[] }[];
	components: { layer: string; file: string; className: string; role: string; callPatterns: string; dataEntities: string[] }[];
	externalIntegrations: { system: string; interaction: string; evidence: string }[];
	dependencyMapUpstream: { capability: string; reason: string; evidence: string }[];
	dependencyMapDownstream: { capability: string; reason: string; evidence: string }[];
	technicalDebtAndRisks: { severity: 'Critical' | 'High' | 'Medium' | 'Low'; finding: string; evidence: string }[];
	verdict: { recommendation: 'Extract-Now' | 'Extract-Later' | 'Keep-as-Monolith'; reasoning: string };
}

function strictObject(properties: Record<string, object>): object {
	return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

function list(items: object): object {
	return { type: 'array', items };
}

const EVIDENCE_LINK = strictObject({ capability: { type: 'string' }, reason: { type: 'string' }, evidence: { type: 'string' } });

const DEEP_ANALYSIS_SCHEMA = strictObject({
	workflowSteps: list(strictObject({ step: { type: 'string' }, description: { type: 'string' }, businessRules: STRINGS, files: STRINGS })),
	components: list(strictObject({ layer: { type: 'string' }, file: { type: 'string' }, className: { type: 'string' }, role: { type: 'string' }, callPatterns: { type: 'string' }, dataEntities: STRINGS })),
	externalIntegrations: list(strictObject({ system: { type: 'string' }, interaction: { type: 'string' }, evidence: { type: 'string' } })),
	dependencyMapUpstream: list(EVIDENCE_LINK),
	dependencyMapDownstream: list(EVIDENCE_LINK),
	technicalDebtAndRisks: list(strictObject({ severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] }, finding: { type: 'string' }, evidence: { type: 'string' } })),
	verdict: strictObject({ recommendation: { type: 'string', enum: ['Extract-Now', 'Extract-Later', 'Keep-as-Monolith'] }, reasoning: { type: 'string' } })
});

/** What the deep analysis needs to know about the capability and the locked strategy. */
export interface DeepAnalysisInput {
	name: string;
	description: string;
	domain: string;
	dependencies: readonly string[];
	/** The locked strategy and its rationale; the exploring call cannot see the report file from inside the sub-project. */
	strategyName: string;
	strategyRationale: string;
}

function buildDeepAnalysisPrompt(input: DeepAnalysisInput): string {
	const { name, domain } = input;
	return `You are a senior software architect performing a deep capability analysis of one specific business capability within a real codebase, rooted at the current working directory. Read actual files (Read/Glob/Grep only, no write access). Every claim must cite a real file path and, where relevant, a real class, function or method name. Do not write generic filler.

## Capability under analysis
Name: "${name}"
Domain: ${domain}
Description: ${input.description}
Known related capabilities (may be upstream or downstream; verify, do not assume direction): ${JSON.stringify(input.dependencies)}

## Agreed decomposition strategy
Strategy: ${input.strategyName}
Rationale: ${input.strategyRationale || 'Not recorded.'}

---

## Investigation steps, in order

**Step 1: Read project documentation first.** Look for and read CLAUDE.md or README files in this directory. They hold authoritative notes on architecture and design decisions that ground the source exploration.

**Step 2: Trace the source implementation.** Search for every file, class, method, route, service, repository, background worker, queue processor, or configuration hook that implements "${name}". Record exact file paths and class or method names.

**Efficiency constraints:**
- Never read inside: node_modules, vendor, .git, log, logs, tmp, dist, build, coverage, .next, target, bin, obj
- Prefer targeted Grep patterns over broad "**/*" at the root
- Aim to complete in roughly 15 to 25 tool calls focused on this capability

---

## Output fields

1. **workflowSteps**: trace the real end-to-end workflow as implemented (request, controller, service, model, or equivalent). For each step give a short label, what actually happens (referencing real code), the decision points, business rules, validation constraints or compliance requirements enforced there (empty array if none observed), and the real file path(s).
2. **components**: a flat list of every concrete file or class implementing this capability. layer is one of route, controller, service, repository, model, worker, component, config. Give the real file, the real class or function name, a one-line role, how it is called (for example "POST /api/skills, invoked by SkillController.create"), and the database tables, models or documents it reads or writes.
3. **externalIntegrations**: external systems, third-party APIs or downstream services this capability calls or is called by, each with how it interacts and a file or configuration entry as evidence. Empty array if none found.
4. **dependencyMapUpstream**: other capabilities THIS capability depends on, each with a reason and real evidence. Do not list a dependency unless you found concrete evidence.
5. **dependencyMapDownstream**: other capabilities that depend on THIS one, each with a reason and real evidence.
6. **technicalDebtAndRisks**: concrete findings only, each with a severity (Critical, High, Medium, Low), a specific finding and real evidence. No generic advice.
7. **verdict**: recommendation (Extract-Now, Extract-Later or Keep-as-Monolith) and a reasoning paragraph grounded in coupling, technical debt, external integrations found, and alignment with the agreed strategy.

Before responding, verify: does every workflowSteps entry cite at least one real file? Does every components entry have a real file path and class name? Does every dependency map entry have real evidence? Remove any entry you cannot support.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
}

/** Explores the sub-project read-only and analyzes one capability in depth. */
export function analyzeCapabilityDeeply(options: { absolutePath: string; input: DeepAnalysisInput; signal: AbortSignal; onEvent: (type: string, message: string) => void; onProcessStart: (kill: () => void) => void }): Promise<CapabilityDeepAnalysis> {
	return runClaude<CapabilityDeepAnalysis>({
		prompt: buildDeepAnalysisPrompt(options.input),
		jsonSchema: DEEP_ANALYSIS_SCHEMA,
		cwd: options.absolutePath,
		signal: options.signal,
		onEvent: options.onEvent,
		onProcessStart: options.onProcessStart
	});
}

/** Layers whose components are where a request or job enters the capability. */
const ENTRY_POINT_LAYERS = /route|controller|worker|handler|endpoint|api/i;

/** The short summary the Index step shows once a capability is analyzed, e.g. "3 entry points, 2 data stores". */
export function summarizeDeepAnalysis(analysis: CapabilityDeepAnalysis): string {
	const components = analysis.components ?? [];
	const entryPoints = components.filter(component => ENTRY_POINT_LAYERS.test(component.layer)).length;
	const dataStores = new Set(components.flatMap(component => component.dataEntities ?? [])).size;
	return `${entryPoints} entry point${entryPoints === 1 ? '' : 's'}, ${dataStores} data store${dataStores === 1 ? '' : 's'}`;
}

/** One capability's deep analysis as a Markdown file for the destination repo. */
export function buildDeepAnalysisMarkdown(seqNum: number, name: string, domain: string, data: CapabilityDeepAnalysis): string {
	const lines: string[] = [`# ${String(seqNum).padStart(2, '0')}: ${name}`, '', `**Domain:** ${domain}`, '', '---', '', '## 1. Workflow', ''];
	data.workflowSteps.forEach((step, index) => {
		lines.push(`**Step ${index + 1}: ${step.step}**`, '', step.description, '');
		if (step.businessRules?.length > 0) {
			lines.push('Business rules:', ...step.businessRules.map(rule => `- ${rule}`), '');
		}
		if (step.files.length > 0) {
			lines.push(`Files: ${step.files.map(file => `\`${file}\``).join(', ')}`, '');
		}
	});
	lines.push('## 2. Components', '', '| Layer | File | Class/Function | Role | Call Patterns | Data Entities |', '|---|---|---|---|---|---|');
	for (const c of data.components) {
		lines.push(`| ${c.layer} | \`${c.file}\` | ${c.className} | ${c.role} | ${c.callPatterns || 'None'} | ${c.dataEntities?.join(', ') || 'None'} |`);
	}
	lines.push('');
	let section = 3;
	if (data.externalIntegrations?.length > 0) {
		lines.push(`## ${section++}. External Integrations`, '', '| System | Interaction | Evidence |', '|---|---|---|');
		for (const e of data.externalIntegrations) {
			lines.push(`| ${e.system} | ${e.interaction} | ${e.evidence} |`);
		}
		lines.push('');
	}
	lines.push(`## ${section++}. Dependency Map`, '', '### Upstream (this capability depends on)', '', '| Capability | Reason | Evidence |', '|---|---|---|');
	for (const d of data.dependencyMapUpstream) {
		lines.push(`| ${d.capability} | ${d.reason} | ${d.evidence} |`);
	}
	lines.push('', '### Downstream (depends on this capability)', '', '| Capability | Reason | Evidence |', '|---|---|---|');
	for (const d of data.dependencyMapDownstream) {
		lines.push(`| ${d.capability} | ${d.reason} | ${d.evidence} |`);
	}
	lines.push('', `## ${section++}. Technical Debt and Risks`, '');
	for (const t of data.technicalDebtAndRisks) {
		lines.push(`**[${t.severity}] ${t.finding}**`, '', `Evidence: ${t.evidence}`, '');
	}
	lines.push(`## ${section}. Modernization Recommendation`, '', `### Verdict: ${data.verdict.recommendation}`, '', data.verdict.reasoning, '');
	return lines.join('\n');
}

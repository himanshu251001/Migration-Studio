import { runClaudeSynthesis } from './claudeCli';

/** A migration unit as the charter sees it. */
export interface CharterUnit {
	name: string;
	domain: string;
	capabilities: { seqNum: number; name: string }[];
	sharedServicesConsumed: string[];
	dependenciesOnOtherUnits: { unitName: string; reason: string }[];
	scopeEstimate: string;
	scopeRationale: string;
	readinessScore: string | null;
	readinessJustification: string;
	wave: number | 'blocked' | null;
	upstreamDependencies: { name: string; reason: string; isHardBlocker: boolean }[];
	migrationBlockers: { blocker: string; origin: string; prerequisiteAction: string }[];
}

/** A shared platform service as the charter sees it. */
export interface CharterSharedService {
	name: string;
	dependentCount: number;
	reason: string;
	readinessScore: string | null;
	readinessJustification: string;
	wave: number | 'blocked' | null;
	migrationBlockers: { blocker: string; origin: string; prerequisiteAction: string }[];
}

export interface CharterInput {
	units: CharterUnit[];
	sharedServices: CharterSharedService[];
	boundaries: { name: string; description?: string; migrationComplexity?: string; projects?: string[]; justification?: string }[];
	strategyRisks: { risk: string; category: string; severity: string }[];
	recommendedStrategy: string;
	strategyRationale: string;
}

/** The charter: why and what of the migration. Stored as received. */
export interface CharterData {
	narrativeParagraph: string;
	goals: { name: string; statement: string; businessDriver: string; successIndicator: string }[];
	scopeInScope: { item: string; justification: string }[];
	scopeOutOfScope: { item: string; justification: string }[];
	constraints: { category: string; constraint: string; justification: string }[];
	successCriteriaByWave: { wave: number; label: string; exitConditions: string[] }[];
	governanceModel: { adrProcess: string; waveGateProcess: string; securityRemediationTracking: string; decisionAuthority: { decision: string; owner: string }[] };
	risksAcknowledged: { risk: string; category: string; severity: 'High' | 'Medium'; mitigationCommitment: string }[];
}

function waveNumbersOf(input: CharterInput): number[] {
	return [...new Set([...input.units, ...input.sharedServices].map(t => t.wave).filter((w): w is number => typeof w === 'number'))].sort((a, b) => a - b);
}

/** The deterministic charter, derived from the units, services and risks alone. Used when Claude's draft fails. */
export function buildCharter(input: CharterInput): CharterData {
	const { units, sharedServices, boundaries, strategyRisks } = input;
	const goals: CharterData['goals'] = [
		{ name: 'Independent deployability', statement: 'Each migration unit can be built, tested, and deployed on its own.', businessDriver: 'Reduce coordination overhead and release risk across teams.', successIndicator: 'Every locked migration unit has its own task set with no cross-unit blocking task.' },
		{ name: 'Business-capability alignment', statement: 'The target architecture is organized around business capabilities, not incidental code structure.', businessDriver: 'The locked decomposition strategy identified capability boundaries as the primary cut.', successIndicator: 'Every migration unit maps to one or more named capabilities in the capability index.' },
		{ name: 'Risk-ordered sequencing', statement: 'Higher-risk, higher-complexity boundaries are addressed earlier in the roadmap.', businessDriver: 'Surface migration surprises while there is still runway to adjust the plan.', successIndicator: 'Wave assignments in the dependency analysis place shared services ahead of their consumers.' }
	];
	if (strategyRisks.length > 0) {
		goals.push({ name: 'Risk mitigation', statement: 'Every High/Critical risk identified during decomposition has an owned mitigation commitment.', businessDriver: `${strategyRisks.length} risk(s) were surfaced during the decomposition strategy step.`, successIndicator: "Every risk in the charter's risk register has a named mitigation commitment." });
	}
	const scopeInScope = [
		...units.map(u => ({ item: u.name, justification: 'Migration unit locked in the migration units catalog.' })),
		...sharedServices.map(s => ({ item: s.name, justification: 'Shared platform service identified in the migration units catalog.' }))
	];
	const scopeOutOfScope = [...units, ...sharedServices].filter(t => t.wave === 'blocked').map(t => ({ item: `${t.name} (deferred)`, justification: 'Marked as blocked in the dependency analysis and excluded from the current wave plan until its blockers are resolved.' }));
	for (const unit of units.filter(u => u.wave == null)) {
		scopeOutOfScope.push({ item: `${unit.name} (not yet sequenced)`, justification: 'No wave assignment in the dependency analysis, so it is excluded from the roadmap pending a readiness review.' });
	}
	if (scopeOutOfScope.length === 0) {
		scopeOutOfScope.push({ item: 'Non-functional rewrites beyond the locked decomposition boundaries', justification: 'Only the migration units and shared services identified in the catalog are being modernized; other refactors are deferred.' });
	}
	const waves = waveNumbersOf(input);
	const highRisks = strategyRisks.filter(r => r.severity === 'High' || r.severity === 'Critical');
	return {
		narrativeParagraph: `This modernization program migrates ${units.length} migration unit(s) and ${sharedServices.length} shared platform service(s) across ${waves.length} wave(s). The decomposition strategy identified ${boundaries.length} modernization boundary(s) as the primary cut. ${highRisks.length} high-severity risk(s) have been acknowledged and require active mitigation. Success is defined wave by wave through verifiable exit conditions tied to capability delivery.`,
		goals,
		scopeInScope,
		scopeOutOfScope,
		constraints: [
			{ category: 'Technology', constraint: 'The target stack is chosen from the reviewed candidates and locked before the technology mapping starts.', justification: 'Keeps target-technology decisions explicit and auditable.' },
			{ category: 'Database', constraint: 'The database migrate-or-retain decision must be made explicitly before execution begins.', justification: 'Avoids silently implying a live data migration when only a data-access swap was intended.' },
			{ category: 'Testing', constraint: 'UI and API parity must be verified against the legacy sub-project before a unit is approved.', justification: 'Parity is the acceptance gate for every unit.' }
		],
		successCriteriaByWave: waves.map(wave => ({
			wave,
			label: wave === 0 ? 'Foundation' : `Wave ${wave}`,
			exitConditions: [...units, ...sharedServices].filter(t => t.wave === wave).map(t => `"${t.name}" is verified and its diff approved.`)
		})),
		governanceModel: {
			adrProcess: 'Deviations from the locked decomposition strategy or target stack require a written architecture decision record before work proceeds.',
			waveGateProcess: 'A wave may not start until every target in the prior wave has readiness Medium or High and no open sequencing violations.',
			securityRemediationTracking: 'Any security-relevant finding surfaced during discovery is tracked as a risk in this charter and may not be silently dropped from scope.',
			decisionAuthority: [
				{ decision: 'Target stack and architecture option', owner: 'Modernization Lead' },
				{ decision: 'Decomposition strategy selection', owner: 'Modernization Lead' },
				{ decision: 'Wave gate approval', owner: 'Engineering Lead' },
				{ decision: 'Mapping entry approval', owner: 'Engineering Lead' }
			]
		},
		risksAcknowledged: highRisks.map(r => ({ risk: r.risk, category: r.category, severity: r.severity === 'Critical' ? 'High' as const : 'Medium' as const, mitigationCommitment: "Addressed before the owning migration unit's wave gate passes." }))
	};
}

const STRINGS = { type: 'array', items: { type: 'string' } };

function strictObject(properties: Record<string, object>): object {
	return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

const CHARTER_SCHEMA = strictObject({
	narrativeParagraph: { type: 'string' },
	goals: { type: 'array', items: strictObject({ name: { type: 'string' }, statement: { type: 'string' }, businessDriver: { type: 'string' }, successIndicator: { type: 'string' } }) },
	scopeInScope: { type: 'array', items: strictObject({ item: { type: 'string' }, justification: { type: 'string' } }) },
	scopeOutOfScope: { type: 'array', items: strictObject({ item: { type: 'string' }, justification: { type: 'string' } }) },
	constraints: { type: 'array', items: strictObject({ category: { type: 'string', enum: ['Budget/Timeline', 'Technology', 'Regulatory', 'Testing', 'Database'] }, constraint: { type: 'string' }, justification: { type: 'string' } }) },
	successCriteriaByWave: { type: 'array', items: strictObject({ wave: { type: 'integer' }, label: { type: 'string' }, exitConditions: STRINGS }) },
	governanceModel: strictObject({
		adrProcess: { type: 'string' }, waveGateProcess: { type: 'string' }, securityRemediationTracking: { type: 'string' },
		decisionAuthority: { type: 'array', items: strictObject({ decision: { type: 'string' }, owner: { type: 'string' } }) }
	}),
	risksAcknowledged: { type: 'array', items: strictObject({ risk: { type: 'string' }, category: { type: 'string' }, severity: { type: 'string', enum: ['High', 'Medium'] }, mitigationCommitment: { type: 'string' } }) }
});

/** Asks Claude to write the charter from the real units, services and risks. Reasoning only, no file access. */
export async function buildCharterWithClaude(input: CharterInput, signal: AbortSignal, onProcessStart: (kill: () => void) => void): Promise<CharterData> {
	const prompt = `You are writing the Modernization Charter, the "why and what" alignment document for this migration. Ground every claim in the data below. Do not invent a goal, constraint, risk, or exit condition that is not traceable to this data.

## Decomposition strategy context
Recommended strategy: ${input.recommendedStrategy}
Rationale: ${input.strategyRationale}

## Migration units (${input.units.length} locked)
${JSON.stringify(input.units, undefined, 2)}

## Shared platform services (${input.sharedServices.length} identified)
${JSON.stringify(input.sharedServices, undefined, 2)}

## Modernization boundaries
${JSON.stringify(input.boundaries, undefined, 2)}

## Risks surfaced during the decomposition strategy
${JSON.stringify(input.strategyRisks, undefined, 2)}

---

## Field-level instructions

**narrativeParagraph:** 3 to 5 sentences for a stakeholder presentation: what is being modernized (unit count, domain count, wave count), why now (the top risks or the strategy driver), and what success looks like. No technical jargon.

**goals (3 to 6):** Derive from the evidence. Each names real units, capabilities, domains or risks, never generic boilerplate. Strong sources: units with Low readiness (resolve blockers before execution), shared services with a high dependentCount (establish them early), High/Critical risks (remediate before the owning wave). Each has a short name, a one-sentence outcome-focused statement, a businessDriver from the data, and a measurable successIndicator.

**scopeInScope:** One entry per migration unit AND per shared platform service, each justified by its domain, capabilities or readiness. Add one entry per High/Critical risk that needs active remediation.

**scopeOutOfScope:** 2 to 4 exclusions specific to the application being modernized: units or services whose wave is "blocked" or null (name them), capabilities or integrations that migrationBlockers say are retired, replaced or left on the legacy side, and boundaries that are outside this program's cut. Every item names a concrete unit, service, capability, dependency, domain or boundary. Never write generic exclusions about tooling or planning artifacts.

**constraints:** Only categories the data evidences: Technology (migration-pattern constraints), Database (when a shared-database blocker exists), Testing (when any readiness is Low), Budget/Timeline (when hard-blocker dependencies constrain sequencing), Regulatory (only if a risk evidences it). Do not fabricate a constraint.

**successCriteriaByWave:** One entry per distinct wave number in the data. List every unit and service in that wave by name. Derive exit conditions mainly from migrationBlockers[].prerequisiteAction, and add "[Unit name] verified against legacy behavior" as the last condition per unit. Label the wave by its dominant domain.

**governanceModel:** adrProcess (ADRs for any deviation from the locked strategy, boundaries or target stack), waveGateProcess (readiness Medium or High and every blocker's prerequisiteAction done before a wave begins), securityRemediationTracking (High/Critical security risks are P0 and may not be deferred past their unit's wave gate), decisionAuthority (4 to 6 entries with specific named roles such as Modernization Lead, Engineering Lead, QA Lead, Product Owner, Security Lead).

**risksAcknowledged:** Only High/Critical risks from the strategy risks (map Critical to High). Each mitigationCommitment is specific and actionable, derived from the risk's category and the owning unit's prerequisiteAction when one matches. No generic boilerplate.

Respond with ONLY the JSON object matching the required schema, with no prose and no markdown fences.`;
	return runClaudeSynthesis<CharterData>({ prompt, jsonSchema: CHARTER_SCHEMA, signal, onProcessStart });
}

/** The charter as a Markdown file for the destination repo; `target` is the locked stack, once there is one. */
export function buildCharterMarkdown(charter: CharterData, target: { name: string; architecture: string } | undefined): string {
	const lines: string[] = ['# Modernization Charter', '', target ? `> **Target Stack:** ${target.name} | ${target.architecture}` : '> **Target Stack:** not chosen yet (the reviewer locks it in the Scope step)', ''];
	if (charter.narrativeParagraph) {
		lines.push('## Executive Summary', '', charter.narrativeParagraph, '');
	}
	lines.push('## Modernization Goals and Business Drivers', '');
	for (const g of charter.goals) {
		lines.push(`### ${g.name}`, '', `**Goal:** ${g.statement}`, '', `**Business Driver:** ${g.businessDriver}`, '', `**Success Indicator:** ${g.successIndicator}`, '');
	}
	lines.push('## Scope', '', '### In Scope', '');
	lines.push(...charter.scopeInScope.map(i => `- **${i.item}**: ${i.justification}`), '', '### Out of Scope', '');
	lines.push(...charter.scopeOutOfScope.map(i => `- **${i.item}**: ${i.justification}`), '', '## Constraints', '');
	for (const c of charter.constraints) {
		lines.push(`### ${c.category}`, '', `- ${c.constraint}`, `  _Evidence: ${c.justification}_`, '');
	}
	lines.push('## Success Criteria by Wave', '');
	for (const w of charter.successCriteriaByWave) {
		lines.push(`### Wave ${w.wave}: ${w.label}`, '', ...w.exitConditions.map(c => `- [ ] ${c}`), '');
	}
	const g = charter.governanceModel;
	lines.push('## Governance Model', '', `### ADR Process\n\n${g.adrProcess}\n`, `### Wave Gate Process\n\n${g.waveGateProcess}\n`, `### Security Remediation Tracking\n\n${g.securityRemediationTracking}\n`, '### Decision Authority', '', '| Decision | Owner |', '|---|---|');
	lines.push(...g.decisionAuthority.map(d => `| ${d.decision} | ${d.owner} |`), '', '## Risks Acknowledged', '', '| Risk | Category | Severity | Mitigation Commitment |', '|---|---|---|---|');
	lines.push(...charter.risksAcknowledged.map(r => `| ${r.risk} | ${r.category} | ${r.severity} | ${r.mitigationCommitment} |`), '');
	return lines.join('\n');
}

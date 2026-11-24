import type { Dimensions } from './discovery';

function bullets(items: readonly string[]): string {
	return items.length > 0 ? items.map(item => `- ${item}`).join('\n') : '_None recorded._';
}

/** One sub-project's discovery as Markdown. */
export function buildSubProjectMarkdown(subProjectPath: string, d: Dimensions): string {
	return [
		`# Discovery: ${subProjectPath}`, '',
		`**Framework:** ${d.framework}`, '',
		'## Business', '', '**Responsibilities:**', bullets(d.business.responsibilities), '', '**Capabilities:**', bullets(d.business.capabilities), '', '**Workflows:**', bullets(d.business.workflows), '', '**Domains:**', bullets(d.business.domains), '', `**Criticality:** ${d.business.criticality}`, '',
		'## Users', '', `**Personas:** ${d.users.personas.join(', ') || 'None'}`, '', `**Roles:** ${d.users.roles.join(', ') || 'None'}`, '', '**Journeys:**', bullets(d.users.journeys), '',
		'## Architecture', '', '**Modules:**', bullets(d.architecture.modules), '', '**Integrations:**', bullets(d.architecture.integrations), '', '**Shared Infrastructure:**', bullets(d.architecture.sharedInfrastructure), '',
		'## Data', '', '**Ownership:**', bullets(d.data.ownership), '', `**Shared Databases:** ${d.data.sharedDatabases.join(', ') || 'None'}`, '',
		'## Dependencies', '', `**Upstream:** ${d.dependencies.upstream.join(', ') || 'None'}`, '', `**Downstream:** ${d.dependencies.downstream.join(', ') || 'None'}`, '', `**External Systems:** ${d.dependencies.externalSystems.join(', ') || 'None'}`, '',
		'## Modernization Characteristics', '', `**Independent Deployability:** ${d.modernization.independentDeployability}`, '', '**Technical Debt:**', bullets(d.modernization.technicalDebt), '', `**Coupling:** ${d.modernization.coupling}`, '', `**Cohesion:** ${d.modernization.cohesion}`, '', `**Migration Complexity:** ${d.modernization.migrationComplexity}`, '', '**Candidate Decomposition Points:**', bullets(d.modernization.decompositionPoints), '',
		'## Evidence', '', bullets(d.evidence), ''
	].join('\n');
}

/** The cross-sub-project index as Markdown. */
export function buildDiscoveryIndexMarkdown(items: readonly { subProjectPath: string; manifestType: string; dimensions: Dimensions }[]): string {
	const databases = new Set(items.flatMap(i => i.dimensions.data.sharedDatabases));
	const domains = new Set(items.flatMap(i => i.dimensions.business.domains));
	return [
		'# Discovery Index', '', `> ${items.length} sub-project(s) analyzed.`, '',
		'| Sub-project | Manifest | Framework | Migration Complexity |', '|---|---|---|---|',
		...items.map(i => `| ${i.subProjectPath} | ${i.manifestType} | ${i.dimensions.framework} | ${i.dimensions.modernization.migrationComplexity} |`), '',
		'## Cross-Project Summary', '',
		`**Shared databases across sub-projects:** ${[...databases].join(', ') || 'None'}`, '',
		`**Business domains observed:** ${[...domains].join(', ') || 'None'}`, ''
	].join('\n');
}

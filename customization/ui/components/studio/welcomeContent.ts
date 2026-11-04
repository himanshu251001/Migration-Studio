/** Copy for the intro page shown when a folder has no migration project yet. */
export interface WelcomeCard {
	readonly icon: string;
	readonly tone: string;
	readonly stage: string;
	readonly title: string;
	readonly text: string;
	readonly tags: readonly string[];
}

export const WELCOME_TAGLINE = 'Automated legacy modernization pipeline for enterprise codebases. Analyze AST dependencies, plan architectural shifts, and transform legacy frameworks into modern stacks.';

export const WELCOME_CARDS: readonly WelcomeCard[] = [
	{
		icon: 'source_environment',
		tone: 'text-primary',
		stage: 'Stage 01',
		title: '1. Configure Repositories',
		text: 'Connect your legacy source directory (ASP.NET Web Forms, Java Spring 3, Cobol) and target modern repositories (.NET 8 + React, Spring Boot 3).',
		tags: ['Git', 'TFS', 'Local Disk', 'SVN']
	},
	{
		icon: 'account_tree',
		tone: 'text-tertiary',
		stage: 'Stage 02',
		title: '2. AST & Dependency Analysis',
		text: 'Auto-discover monolithic dependencies, database access layers, tightly coupled components, and compute cyclical complexity scores.',
		tags: ['Graph Traversal', 'Static call hierarchies']
	},
	{
		icon: 'auto_fix_high',
		tone: 'text-secondary',
		stage: 'Stage 03',
		title: '3. Automated Transformation',
		text: 'Execute guided LLM + deterministic code transforms with live diff verification, mock API routing, and unit test stub generation.',
		tags: ['Deterministic Check', 'Diff verification']
	}
];

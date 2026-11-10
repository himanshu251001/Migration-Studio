import type { AnalysisResult } from '@/features/migration/analyze';

/** Sample analysis of the legacy "Customer Portal" codebase. */
export const ANALYZE_FIXTURE: AnalysisResult = {
	tasks: [
		{ label: 'Scanning source files', description: 'Parsing .aspx, .cs, .ascx code-behind files', total: 1245, doneMeta: '1,245 / 1,245' },
		{ label: 'Invoking Claude (read-only) for AST analysis', description: 'Deep architectural inference and coupling map', doneMeta: '38s inference' },
		{ label: 'Reviewing the codebase', description: 'Find patterns, dependencies and risks', doneMeta: '18 risks flagged' },
		{ label: 'Generating analysis report', description: 'Create summary of architectural findings', doneMeta: '4.2 MB artifact' }
	],
	logs: [
		'[INFO] Scanning /App_Code/DAL/CartProvider.cs ... AST parsed (1,420 tokens)',
		'[DEBUG] Detected direct System.Data.SqlClient injection pattern',
		'[INFO] Resolving Autofac module registrations ...',
		'[ANALYZING] /Views/Checkout/ProcessOrder.aspx.cs',
		'[DEBUG] HttpContext.Current usage found in 32 endpoints',
		'[INFO] Building coupling map between 86 components ...',
		'[INFO] Writing migration-analysis-report.json'
	],
	discovery: [
		{ key: 'Framework', value: 'ASP.NET Web Forms on .NET Framework 4.7.2 (C#), EF6, Autofac 4.9' },
		{ key: 'Target', value: '.NET 8 Web API + React 18' },
		{ key: 'Domains', value: 'E-commerce, Catalog, Checkout, Payments' },
		{ key: 'Criticality', value: 'Medium', tone: 'warning' },
		{ key: 'Technical debt', value: 'High (tight data-layer coupling)', tone: 'danger' }
	],
	metrics: { filesScanned: 1245, components: 86, risks: 18 },
	blockers: 'Web Forms and System.Web are incompatible with the .NET runtime. Entity Framework 6 needs an upgrade to EF Core 8. Heavy use of HttpModules and synchronous SQL data adapters.',
	artifacts: [
		{ id: 'analysis-report', icon: 'data_object', name: 'migration-analysis-report.json', meta: '4.2 MB · AST & dependency graph', path: 'migration-analysis-report.json', content: JSON.stringify({ project: 'Customer Portal', filesScanned: 1245, components: 86, risks: 18, domains: ['E-commerce', 'Catalog', 'Checkout', 'Payments'] }, undefined, '\t') + '\n' },
		{ id: 'claude-md', icon: 'terminal', name: 'CLAUDE.md', meta: '148 KB · context instructions', path: 'CLAUDE.md', content: '# Customer Portal\n\nLegacy ASP.NET Web Forms (.NET Framework 4.7.2) being migrated to .NET 8 Web API + React 18.\n\n## Context\n\n- Data layer is tightly coupled to System.Data.SqlClient.\n- HttpContext.Current is used in 32 endpoints.\n' }
	],
	duration: '2m 14s',
	errors: 0
};

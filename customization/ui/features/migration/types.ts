/** A migration project found in (or created for) the opened folder: legacy source -> modern destination. */
export interface Project {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	/** Folder holding the legacy source code. */
	readonly source: string;
	/** Folder receiving the migrated code. */
	readonly dest: string;
}

/** What the user fills in when creating a project. */
export type ProjectDraft = Omit<Project, 'id'>;

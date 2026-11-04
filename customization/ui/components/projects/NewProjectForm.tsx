'use client';

import { useEffect, useState } from 'react';
import { Button, Icon } from '@/components/ui';
import type { Project, ProjectDraft } from '@/features/migration/types';
import { useServices } from '@/services/ServiceProvider';

const FIELD = 'w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-md px-3 py-2 text-body-sm font-body-sm placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors';

type PathKey = 'source' | 'dest';

/** Center-panel form for creating a migration project when none was detected. */
export function NewProjectForm({ folder, onCreated, onCancel }: { folder: string; onCreated: (project: Project) => void; onCancel?: () => void }) {
	const { projects } = useServices();
	/** The folder open in the IDE. Only one of source/destination may use it. */
	const CURRENT_REPO = folder;
	const [form, setForm] = useState<ProjectDraft | undefined>();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		let cancelled = false;
		projects.createDraft().then(draft => !cancelled && setForm(draft));
		return () => { cancelled = true; };
	}, [projects]);

	if (!form) {
		return <p className="p-space-md text-body-sm text-outline">Loading…</p>;
	}

	const set = (key: keyof ProjectDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
	const toggleCurrent = (key: PathKey) => () => setForm({ ...form, [key]: form[key] === CURRENT_REPO ? '' : CURRENT_REPO });

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setError(undefined);
		try {
			onCreated(await projects.createProject(folder, form));
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSaving(false);
		}
	};

	return (
		<form onSubmit={submit} className="p-space-md space-y-space-lg">
			<div className="flex items-center gap-space-sm pb-space-md border-b border-outline-variant/40">
				<div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
					<Icon name="add" className="text-[20px]" />
				</div>
				<div className="min-w-0">
					<h1 className="text-headline-md font-headline-md">New Migration Project</h1>
					<p className="text-body-sm font-body-sm text-on-surface-variant">Configure the legacy source and modern destination. Saved by Migration Studio, not in your repository.</p>
				</div>
			</div>

			<Section title="1. Project Identification">
				<Field label="Project Name" id="project-name" required>
					<input id="project-name" className={FIELD} required value={form.name} onChange={set('name')} placeholder="e.g., Customer Portal" />
				</Field>
				<Field label="Description & Migration Scope" id="project-description">
					<input id="project-description" className={FIELD} value={form.description} onChange={set('description')} placeholder='e.g An AI-powered application designed to automate code migration from one technology stack to another, helping developers streamline the migration process, generate code, and track progress efficiently.'/>
				</Field>
			</Section>

			<Section title="2. Source Repository (Legacy)">
				<Field label="Local Directory Path" id="source-path" required>
					<PathInput id="source-path" value={form.source} onChange={set('source')} browse="Browse…" current={{ active: form.source === CURRENT_REPO, disabled: form.dest === CURRENT_REPO, toggle: toggleCurrent('source') }} />
				</Field>
			</Section>

			<Section title="3. Destination Repository (Modern)">
				<Field label="Local Destination Directory" id="dest-path" required>
					<PathInput id="dest-path" value={form.dest} onChange={set('dest')} browse="Browse…" current={{ active: form.dest === CURRENT_REPO, disabled: form.source === CURRENT_REPO, toggle: toggleCurrent('dest') }} />
				</Field>
			</Section>

			{error && <p role="alert" className="text-body-sm font-body-sm text-error">{error}</p>}
			<div className="pt-space-md flex flex-wrap items-center justify-end gap-space-sm border-t border-outline-variant/40">
				{onCancel && <Button onClick={onCancel}>Cancel</Button>}
				<Button type="submit" variant="primary" icon="check" disabled={saving}>Save &amp; Open Workspace</Button>
			</div>
		</form>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="bg-surface-container-low border border-outline-variant/40 rounded-xl p-space-md shadow-sm space-y-space-md">
			<h2 className="text-headline-sm font-headline-sm border-b border-outline-variant/40 pb-space-sm">{title}</h2>
			{children}
		</section>
	);
}

function Field({ label, id, required, children }: { label: string; id: string; required?: boolean; children: React.ReactNode }) {
	return (
		<div className="space-y-space-xs">
			<label htmlFor={id} className="block text-body-sm font-body-sm font-semibold">
				{label} {required && <span className="text-primary">*</span>}
			</label>
			{children}
		</div>
	);
}

function PathInput({ id, value, onChange, browse, current }: {
	id: string;
	value: string;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	browse: string;
	current: { active: boolean; disabled: boolean; toggle: () => void };
}) {
	return (
		<div className="flex flex-wrap gap-space-sm">
			<input id={id} required value={value} onChange={onChange} className={`${FIELD} flex-1 min-w-[180px] font-code-snippet`} />
			<Button
				onClick={current.toggle}
				disabled={current.disabled}
				aria-pressed={current.active}
				icon={current.active ? 'check_circle' : 'my_location'}
				title={current.disabled ? 'Current repo is already used by the other path' : 'Use the repository currently open in the IDE'}
				className={current.active ? 'border-primary text-primary' : ''}
			>
				{current.active ? 'Using Current Repo' : 'Use Current Repo'}
			</Button>
			<Button icon="folder_open">{browse}</Button>
		</div>
	);
}

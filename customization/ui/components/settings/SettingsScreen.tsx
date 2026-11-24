'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Icon } from '@/components/ui';
import { MODEL_OPTIONS, type BackendMode, type CheckStatus, type Settings, type SettingsCheck } from '@/features/migration/settings';
import { setBackendMode } from '@/lib/backendMode';
import { useNavigate } from '@/state/useNavigate';

const FIELD = 'w-full bg-surface-container-lowest border border-outline-variant text-on-surface rounded-md px-3 py-2 text-body-sm font-body-sm placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors';

/** Form state: numbers stay text while typing. */
interface Form {
	mongoUri: string;
	claudePath: string;
	model: string;
	apiKey: string;
	maxBudgetUsd: string;
	idleTimeoutSec: string;
	maxTimeoutSec: string;
}

function toForm(s: Settings): Form {
	return { mongoUri: s.mongoUri, claudePath: s.claudePath, model: s.model, apiKey: s.apiKey, maxBudgetUsd: String(s.maxBudgetUsd), idleTimeoutSec: String(s.idleTimeoutSec), maxTimeoutSec: String(s.maxTimeoutSec) };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	const data = await response.json().catch(() => ({})) as T & { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? `Request failed (${response.status}).`);
	}
	return data;
}

const put = (body: Partial<Settings>) => request<{ settings: Settings }>('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Settings page: choose the backend (mock data or Claude CLI + MongoDB) and configure the real one. Works without MongoDB. */
export function SettingsScreen() {
	const navigate = useNavigate();
	const [mode, setMode] = useState<BackendMode>('mock');
	const [form, setForm] = useState<Form | undefined>();
	const [error, setError] = useState<string | undefined>();
	const [notice, setNotice] = useState<string | undefined>();
	const [showKey, setShowKey] = useState(false);
	const [busy, setBusy] = useState(false);
	const [check, setCheck] = useState<SettingsCheck | undefined>();

	useEffect(() => {
		request<{ settings: Settings }>('/api/settings').then(d => {
			setMode(d.settings.backendMode);
			setBackendMode(d.settings.backendMode);
			setForm(toForm(d.settings));
		}, e => setError(e instanceof Error ? e.message : 'The settings could not be loaded.'));
	}, []);

	const pickMode = async (next: BackendMode) => {
		if (next === mode) {
			return;
		}
		setError(undefined);
		setNotice(undefined);
		try {
			const { settings } = await put({ backendMode: next });
			setMode(settings.backendMode);
			setBackendMode(settings.backendMode);
			setNotice('Mock data and Claude CLI results are stored separately. Progress made in one mode does not carry over to the other.');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'The backend could not be changed.');
		}
	};

	const save = async (): Promise<boolean> => {
		if (!form) {
			return false;
		}
		setError(undefined);
		setNotice(undefined);
		try {
			const { settings } = await put({ mongoUri: form.mongoUri, claudePath: form.claudePath, model: form.model, apiKey: form.apiKey, maxBudgetUsd: Number(form.maxBudgetUsd), idleTimeoutSec: Number(form.idleTimeoutSec), maxTimeoutSec: Number(form.maxTimeoutSec) });
			setForm(toForm(settings));
			return true;
		} catch (e) {
			setError(e instanceof Error ? e.message : 'The settings could not be saved.');
			return false;
		}
	};

	const saveClick = async () => {
		setBusy(true);
		if (await save()) {
			setNotice('Settings saved.');
		}
		setBusy(false);
	};

	const test = async () => {
		setBusy(true);
		setCheck(undefined);
		if (await save()) {
			try {
				setCheck(await request<SettingsCheck>('/api/settings/check'));
			} catch (e) {
				setError(e instanceof Error ? e.message : 'The connection test failed.');
			}
		}
		setBusy(false);
	};

	const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => f && { ...f, [key]: e.target.value });

	const live = mode === 'real';
	const sectionTitle = 'flex items-center gap-space-xs text-label-sm font-label-sm font-semibold uppercase tracking-wider text-on-surface-variant';
	return (
		<main className="w-full min-h-full p-space-md sm:p-space-lg text-on-surface">
			<div className="w-full rounded-xl border border-outline-variant bg-surface-container-low shadow-lg">
				<header className="flex items-center justify-between gap-space-md px-space-lg py-space-md border-b border-outline-variant/60">
					<div className="flex items-center gap-space-sm flex-wrap min-w-0">
						<h1 className="font-headline-xl text-headline-xl tracking-tight">Settings</h1>
						<Badge className={live ? 'bg-tertiary/15 text-tertiary' : 'bg-primary/15 text-primary'}>{live ? 'LIVE' : 'MOCK DATA'}</Badge>
					</div>
					<Button icon="close" onClick={navigate.closeStudio}>Close</Button>
				</header>

				<div className="p-space-lg space-y-space-lg">
					<section className="space-y-space-sm">
						<h2 className={sectionTitle}><Icon name="swap_horiz" className="text-[16px]" />Backend / Data source</h2>
						<div role="radiogroup" aria-label="Backend" className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
							<ModeOption active={mode === 'mock'} icon="science" title="Mock Data" text="Uses built-in sample data without executing external CLI commands. Nothing is analysed and no services are needed." onClick={() => pickMode('mock')} />
							<ModeOption active={live} icon="terminal" title="Live" text="Runs live repository analysis and real-time execution via Claude CLI on your machine." onClick={() => pickMode('real')} />
						</div>
					</section>

					{live && <section className="space-y-space-sm">
						<h2 className={sectionTitle}><Icon name="tune" className="text-[16px]" />Live configuration</h2>
						{!form ? <p className="text-body-sm text-outline">Loading…</p> : (
							<div className={`rounded-lg border border-outline-variant bg-surface-container p-space-md space-y-space-md`}>
								<Field label="Model" optional id="model" hint="Model version used for live code analysis and tool calls. Uses the recommended default if unchanged.">
									<select id="model" className={FIELD} value={form.model} onChange={e => setForm(f => f && { ...f, model: e.target.value })}>
										{MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
										{!MODEL_OPTIONS.some(o => o.value === form.model) && <option value={form.model}>{form.model}</option>}
									</select>
								</Field>
								<Field label="API Key" optional id="api-key" hint="Leave blank to use CLI environment auth or global configuration. Active during Live mode." action={<button type="button" className="text-label-sm text-primary hover:underline" onClick={() => setShowKey(v => !v)}>{showKey ? 'Hide' : 'Show'}</button>}>
									<input id="api-key" type={showKey ? 'text' : 'password'} className={`${FIELD} font-code-snippet`} value={form.apiKey} onChange={set('apiKey')} autoComplete="off" spellCheck={false} placeholder="sk-ant-…" />
								</Field>
							</div>
						)}
						<p className="text-label-sm font-label-sm italic text-outline">Note: Mock data and Claude CLI results are stored separately. Progress made in one mode does not carry over to the other.</p>
					</section>}
				</div>

				<footer className="flex items-center justify-between gap-space-md px-space-lg py-space-md border-t border-outline-variant/60">
					<div className="flex items-center gap-space-xs text-label-sm font-label-sm min-w-0">
						{error ? <span role="alert" className="text-error">{error}</span> : (
							<>
								<span className="inline-block h-2 w-2 rounded-full bg-tertiary shrink-0" />
								<span role="status" className="text-on-surface-variant">{notice === 'Settings saved.' ? notice : 'Ready'}</span>
							</>
						)}
					</div>
					<Button variant="primary" icon="save" onClick={saveClick} disabled={busy || !form}>Save</Button>
				</footer>
			</div>
		</main>
	);
	}

function ModeOption({ active, icon, title, text, onClick }: { active: boolean; icon: string; title: string; text: string; onClick: () => void }) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={active}
			onClick={onClick}
			className={`text-left p-space-md rounded-lg border transition-colors w-full ${active ? 'border-primary bg-primary/10' : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container'}`}
		>
			<div className="flex items-center gap-space-xs font-semibold text-body-md">
				<Icon name={icon} className={`text-[18px] ${active ? 'text-primary' : 'text-on-surface-variant'}`} />
				{title}
			</div>
			<p className="mt-1 text-body-sm font-body-sm text-on-surface-variant">{text}</p>
		</button>
	);
}

function Field({ label, id, hint, optional, action, children }: { label: string; id: string; hint?: string; optional?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
	return (
		<div className="space-y-space-xs">
			<div className="flex items-center justify-between">
				<label htmlFor={id} className="block text-body-sm font-body-sm font-semibold">{label}{optional && <span className="ml-1 font-normal text-outline">(Optional)</span>}</label>
				{action}
			</div>
			{children}
			{hint && <p className="text-label-sm font-label-sm text-outline">{hint}</p>}
		</div>
	);
}

function CheckRow({ label, status }: { label: string; status: CheckStatus }) {
	return (
		<div className="flex items-start gap-space-xs text-body-sm font-body-sm">
			<Icon name={status.ok ? 'check_circle' : 'error'} className={`text-[18px] shrink-0 ${status.ok ? 'text-tertiary' : 'text-error'}`} />
			<span><strong className="font-semibold">{label}:</strong> {status.detail}</span>
		</div>
	);
}

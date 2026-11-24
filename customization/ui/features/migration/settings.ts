/** Which backend serves the migration pipeline. `mock` is the fixture data, `real` is the Claude CLI + MongoDB stack. */
export type BackendMode = 'mock' | 'real';

export const BACKEND_MODES: readonly BackendMode[] = ['mock', 'real'];

/** Settings as stored on the server. `mongoUri` may carry credentials, so the API only ever returns it redacted. */
export interface Settings {
	backendMode: BackendMode;
	mongoUri: string;
	/** The `claude` executable: a bare command name (looked up on PATH) or an absolute path. */
	claudePath: string;
	/** Claude model id for live runs; empty means the CLI default. */
	model: string;
	/** Anthropic API key for live runs; empty means use the CLI's own auth. Only ever returned redacted. */
	apiKey: string;
	/** Spend cap per Claude run, in US dollars. */
	maxBudgetUsd: number;
	/** A run is stopped after this many seconds without output. */
	idleTimeoutSec: number;
	/** A run is stopped after this many seconds in total. */
	maxTimeoutSec: number;
}

export const DEFAULT_SETTINGS: Settings = {
	backendMode: 'mock',
	mongoUri: 'mongodb://127.0.0.1:27017/migration-studio',
	claudePath: 'claude',
	model: '',
	apiKey: '',
	maxBudgetUsd: 5,
	idleTimeoutSec: 300,
	maxTimeoutSec: 600
};

export interface CheckStatus {
	ok: boolean;
	detail: string;
}

export interface SettingsCheck {
	mongo: CheckStatus;
	claude: CheckStatus;
}

/** Hides the password of a connection string: `mongodb://user:secret@host` becomes `mongodb://user:***@host`. */
export function redactMongoUri(uri: string): string {
	return uri.replace(/^([a-z][a-z0-9+.-]*:\/\/[^:/@\s]+):[^@\s]*@/i, '$1:***@');
}

/** Text shown in place of a stored API key; sending it back means "unchanged". */
export const REDACTED_KEY = '••••••••••••';

export const MODEL_OPTIONS: readonly { value: string; label: string }[] = [
	{ value: '', label: 'CLI default (Recommended)' },
	{ value: 'claude-sonnet-5-5', label: 'claude-sonnet-5-5' },
	{ value: 'claude-opus-5-5', label: 'claude-opus-5-5' },
	{ value: 'claude-haiku-5-5', label: 'claude-haiku-5-5' }
];

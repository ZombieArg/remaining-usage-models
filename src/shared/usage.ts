export const PROVIDERS = ['codex', 'claude'] as const;

export type ProviderId = (typeof PROVIDERS)[number];

/** Total record, so a new provider cannot silently borrow another's name. */
export const PROVIDER_NAMES: Record<ProviderId, string> = { codex: 'Codex', claude: 'Claude' };
export type SnapshotState = 'ready' | 'stale' | 'unavailable';

/**
 * Single source of truth: the main process matches thrown probe errors against
 * this list, so a code added here is never silently downgraded to probe-failed.
 */
export const DIAGNOSTIC_CODES = [
  'not-checked',
  'cli-not-found',
  'login-required',
  'workspace-required',
  'trust-required',
  'timeout',
  'incompatible-output',
  'probe-failed',
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export interface UsageBucket {
  label: string;
  remainingPercent?: number;
  remainingText?: string;
  resetText?: string;
  /** ISO timestamp when the local CLI provides one. */
  resetAt?: string;
}

export interface UsageSnapshot {
  provider: ProviderId;
  state: SnapshotState;
  /** 0-100 only when a provider reports a trustworthy percentage. */
  remainingPercent?: number;
  /** Provider-provided text when a numeric percentage is unavailable. */
  remainingText?: string;
  resetText?: string;
  /** A provider can expose more than one independently resetting plan limit. */
  buckets?: UsageBucket[];
  observedAt?: string;
  checkedAt: string;
  cliPath?: string;
  diagnostic?: DiagnosticCode;
}

export interface AvailabilityRestoredEvent {
  provider: ProviderId;
  bucketLabel: string;
  remainingPercent: number;
}

export interface AppSettings {
  refreshMinutes: number;
  compactMode: boolean;
  windowBounds?: { x: number; y: number };
  cliPaths: Partial<Record<ProviderId, string>>;
  claudeWorkspace?: string;
}

export interface UsageBridge {
  getSnapshots(): Promise<UsageSnapshot[]>;
  refresh(): Promise<UsageSnapshot[]>;
  getSettings(): Promise<AppSettings>;
  setRefreshMinutes(minutes: number): Promise<AppSettings>;
  setCompactMode(compact: boolean): Promise<AppSettings>;
  selectClaudeWorkspace(): Promise<AppSettings>;
  findCliCandidates(provider: ProviderId): Promise<string[]>;
  setCliPath(provider: ProviderId, path: string): Promise<AppSettings>;
  selectCliPath(provider: ProviderId): Promise<AppSettings>;
  minimize(): Promise<void>;
  getSystemLocale(): Promise<string>;
  onSnapshots(listener: (snapshots: UsageSnapshot[]) => void): () => void;
  onAvailabilityRestored(listener: (events: AvailabilityRestoredEvent[]) => void): () => void;
}

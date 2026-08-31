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

/** Remaining percentages that are worth interrupting the user for, tightest last. */
export const LOW_THRESHOLDS = [20, 10] as const;

export interface UsageAlertEvent {
  /** 'low' warns before the wall; 'restored' reports a verified limit coming back. */
  kind: 'low' | 'restored';
  provider: ProviderId;
  bucketLabel: string;
  remainingPercent: number;
  /** The threshold that was crossed, present on 'low' alerts only. */
  threshold?: number;
}

export interface AppSettings {
  refreshMinutes: number;
  compactMode: boolean;
  /** Mirrors the Windows login item; the operating system stays the source of truth. */
  startWithWindows: boolean;
  windowBounds?: { x: number; y: number };
  cliPaths: Partial<Record<ProviderId, string>>;
  claudeWorkspace?: string;
}

export interface UsageBridge {
  getSnapshots(): Promise<UsageSnapshot[]>;
  refresh(): Promise<UsageSnapshot[]>;
  /** Providers currently being read, including during the refresh started at launch. */
  refreshingProviders(): Promise<ProviderId[]>;
  getSettings(): Promise<AppSettings>;
  setRefreshMinutes(minutes: number): Promise<AppSettings>;
  setCompactMode(compact: boolean): Promise<AppSettings>;
  selectClaudeWorkspace(): Promise<AppSettings>;
  setStartWithWindows(start: boolean): Promise<AppSettings>;
  findCliCandidates(provider: ProviderId): Promise<string[]>;
  setCliPath(provider: ProviderId, path: string): Promise<AppSettings>;
  selectCliPath(provider: ProviderId): Promise<AppSettings>;
  minimize(): Promise<void>;
  getSystemLocale(): Promise<string>;
  onSnapshots(listener: (snapshots: UsageSnapshot[]) => void): () => void;
  /** Fires for every read, including the ones the timer and the tray start. */
  onRefreshState(listener: (providers: ProviderId[]) => void): () => void;
  onUsageAlerts(listener: (events: UsageAlertEvent[]) => void): () => void;
}

/**
 * Claude names its windows "Current week (all models)", which overflows both a
 * compact row and a tray tooltip. The full name stays in the expanded card;
 * here only the word that tells the windows apart is kept.
 */
export function shortBucketLabel(label: string): string {
  return label
    .replace(/\([^)]*\)/g, '')
    .replace(/^current\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim() || label;
}

/** Verified percentages only, as "week 64% · session 20%". Empty when none is verifiable. */
export function summarizeSnapshot(snapshot: UsageSnapshot): string {
  return (snapshot.buckets ?? [])
    .filter((bucket) => bucket.remainingPercent !== undefined)
    .map((bucket) => `${shortBucketLabel(bucket.label)} ${bucket.remainingPercent}%`)
    .join(' · ');
}

/**
 * The tightest verified limit across every provider, which is the one that will
 * actually stop the user. Undefined when nothing verifiable is on screen.
 */
export function lowestRemainingPercent(snapshots: UsageSnapshot[]): number | undefined {
  const percentages = snapshots
    .flatMap((snapshot) => snapshot.buckets ?? [])
    .map((bucket) => bucket.remainingPercent)
    .filter((percent): percent is number => percent !== undefined);
  return percentages.length ? Math.min(...percentages) : undefined;
}

/**
 * A reading from forty minutes ago looks identical to one from thirty seconds
 * ago, which is misleading when a timer was skipped or the machine was asleep.
 * The allowance is generous on purpose: a slow probe is not an outage.
 */
export function isStaleByAge(snapshot: UsageSnapshot, refreshMinutes: number, now: number): boolean {
  if (!snapshot.observedAt) return false;
  const age = now - new Date(snapshot.observedAt).getTime();
  if (!Number.isFinite(age)) return false;
  return age > Math.max(3 * refreshMinutes, 15) * 60_000;
}

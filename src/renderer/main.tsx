import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isStaleByAge, summarizeSnapshot, type AppSettings, type ProviderId, type UsageAlertEvent, type SnapshotState, type UsageBucket, type UsageSnapshot } from '../shared/usage';
import { diagnosticLabel, languageFromLocale, providerName, stateLabel, translator, type Language } from './i18n';
import './styles.css';

function timeLabel(value: string | undefined, locale: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

/**
 * A countdown is what the user actually acts on, but only Codex reports a real
 * timestamp. Claude exposes free text, which is shown verbatim rather than
 * parsed into a time the CLI never promised.
 */
function resetDisplay(bucket: UsageBucket, locale: string, fallback: string, now: number) {
  if (!bucket.resetAt) return { label: bucket.resetText ?? fallback };
  const at = new Date(bucket.resetAt);
  const absolute = new Intl.DateTimeFormat(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(at);
  const minutes = Math.round((at.getTime() - now) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes >= 1_440) return { label: absolute };
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return { label: minutes < 60 ? relative.format(minutes, 'minute') : relative.format(Math.round(minutes / 60), 'hour'), title: absolute };
}

/** Rising for good news, falling for a warning, so the two are told apart without looking. */
async function playAlertSound(kind: UsageAlertEvent['kind']) {
  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  await context.resume();
  const [first, second] = kind === 'restored' ? [660, 880] : [880, 660];
  for (const offset of [0, 0.24]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(offset ? second : first, context.currentTime + offset);
    gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + offset + 0.19);
  }
  window.setTimeout(() => void context.close(), 700);
}

/** Re-renders on a slow tick so a reset countdown does not freeze at its first value. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * A read takes seconds, so silence reads as a frozen window. The same spinner
 * marks the button, the header bar and every card being re-read.
 */
function Spinner({ className = '' }: { className?: string }) {
  return <span className={`spinner ${className}`.trim()} aria-hidden="true" />;
}

function StateBadge({ state, language, refreshing }: { state: SnapshotState; language: Language; refreshing: boolean }) {
  const t = translator(language);
  if (refreshing) return <span className="state checking"><Spinner className="tiny" />{t('checking')}</span>;
  return <span className="state"><i />{stateLabel(language, state)}</span>;
}

function Bucket({ bucket, language, locale, now }: { bucket: UsageBucket; language: Language; locale: string; now: number }) {
  const t = translator(language);
  const display = bucket.remainingPercent === undefined ? bucket.remainingText ?? t('noVerifiedData') : `${bucket.remainingPercent}%`;
  const reset = resetDisplay(bucket, locale, t('notReported'), now);
  return <div className="bucket">
    <div className="usage-row"><strong>{display}</strong><span>{t('remaining')}</span></div>
    <div className="bucket-label">{bucket.label}</div>
    <div className="meta-row"><span>{t('reset')}</span><b title={reset.title}>{reset.label}</b></div>
  </div>;
}

/**
 * Recovery for a CLI that is installed but off PATH. Nobody should have to hunt
 * for an .exe, so the app scans first and offers what it found; browsing the
 * disk by hand stays the last resort.
 */
function CliRecovery({ provider, language, onSettings }: { provider: ProviderId; language: Language; onSettings: (settings: AppSettings) => void }) {
  const t = translator(language);
  const [candidates, setCandidates] = useState<string[] | undefined>();
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } catch (error) { console.error('CLI recovery failed:', error); } finally { setBusy(false); }
  };

  const search = () => void run(async () => setCandidates(await window.usage.findCliCandidates(provider)));
  const use = (path: string) => void run(async () => onSettings(await window.usage.setCliPath(provider, path)));
  const browse = () => void run(async () => onSettings(await window.usage.selectCliPath(provider)));

  return <div className="cli-recovery no-drag">
    {candidates === undefined
      ? <button onClick={search} disabled={busy}>{busy ? t('searching') : t('searchCli')}</button>
      : <>
        {candidates.map((candidate) => <div key={candidate} className="cli-candidate">
          <code title={candidate}>{candidate}</code>
          <button onClick={() => use(candidate)} disabled={busy}>{t('useThisCli')}</button>
        </div>)}
        {candidates.length === 0 && <p className="cli-hint">{t('noCandidatesFound')}</p>}
        <button onClick={browse} disabled={busy}>{t('chooseCliManually')}</button>
        <p className="cli-hint">{t('cliHint')}</p>
      </>}
  </div>;
}

export function UsageCard({ snapshot, language, locale, refreshing, now, state, onSettings }: { snapshot: UsageSnapshot; language: Language; locale: string; refreshing: boolean; now: number; state: SnapshotState; onSettings: (settings: AppSettings) => void }) {
  const t = translator(language);
  const buckets = snapshot.buckets?.length ? snapshot.buckets : [];
  return <article className={`usage-card ${state}`} aria-busy={refreshing}>
    <div className="card-header">
      <span className="provider-name">{providerName(language, snapshot.provider)}</span>
      <StateBadge state={state} language={language} refreshing={refreshing} />
    </div>
    {buckets.length ? buckets.map((bucket, index) => <Bucket key={`${bucket.label}-${index}`} bucket={bucket} language={language} locale={locale} now={now} />) :
      <div className="usage-row unavailable-data"><strong>{t('noVerifiedData')}</strong></div>}
    <div className="meta-row"><span>{t('lastRead')}</span><b>{timeLabel(snapshot.observedAt ?? snapshot.checkedAt, locale)}</b></div>
    {snapshot.cliPath && <div className="meta-row"><span>{t('detectedCli')}</span><b className="cli-path" title={snapshot.cliPath}>{snapshot.cliPath}</b></div>}
    {snapshot.diagnostic && <p className="error">{diagnosticLabel(language, snapshot.diagnostic)}</p>}
    {snapshot.diagnostic === 'cli-not-found' && <CliRecovery provider={snapshot.provider} language={language} onSettings={onSettings} />}
  </article>;
}

export function CompactCard({ snapshot, language, refreshing, state }: { snapshot: UsageSnapshot; language: Language; refreshing: boolean; state: SnapshotState }) {
  const t = translator(language);
  const summary = summarizeSnapshot(snapshot);
  return <article className={`compact-card ${state}`} aria-busy={refreshing}>
    <span className="provider-name">{providerName(language, snapshot.provider)}</span>
    <b>{summary || t('noVerifiedData')}</b>
    <StateBadge state={state} language={language} refreshing={refreshing} />
  </article>;
}

function App() {
  const [snapshots, setSnapshots] = useState<UsageSnapshot[]>([]);
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [locale, setLocale] = useState(navigator.language);
  const [pending, setPending] = useState<ProviderId[]>([]);
  const [alerts, setAlerts] = useState<UsageAlertEvent[]>([]);
  const now = useNow();
  const refreshing = pending.length > 0;
  const language = useMemo(() => languageFromLocale(locale), [locale]);
  const t = translator(language);

  useEffect(() => {
    void window.usage.getSnapshots().then(setSnapshots);
    void window.usage.getSettings().then(setSettings);
    void window.usage.getSystemLocale().then(setLocale);
    return window.usage.onSnapshots(setSnapshots);
  }, []);

  // The launch read is already running by the time this window paints, so the
  // current state is asked for once and then kept in sync by the event.
  useEffect(() => {
    void window.usage.refreshingProviders().then(setPending);
    return window.usage.onRefreshState(setPending);
  }, []);

  useEffect(() => window.usage.onUsageAlerts((events) => {
    setAlerts(events);
    void playAlertSound(events.some((event) => event.kind === 'low') ? 'low' : 'restored');
    window.setTimeout(() => setAlerts([]), 12_000);
  }), []);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  // The main process owns the list; setting it here only avoids a blank frame
  // between the click and the event that confirms the read started.
  const refresh = async () => {
    setPending(snapshots.map((snapshot) => snapshot.provider));
    try { setSnapshots(await window.usage.refresh()); }
    catch (error) { console.error('Refresh failed:', error); setPending([]); }
  };

  const updateFrequency = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = await window.usage.setRefreshMinutes(Number(event.target.value));
    setSettings(next);
  };

  // A 'ready' snapshot nobody managed to refresh for a long while is no longer
  // current, even though the last read succeeded.
  const displayState = (snapshot: UsageSnapshot) =>
    snapshot.state === 'ready' && isStaleByAge(snapshot, settings?.refreshMinutes ?? 5, now) ? 'stale' : snapshot.state;

  const chooseWorkspace = async () => setSettings(await window.usage.selectClaudeWorkspace());
  const toggleStartup = async () => setSettings(await window.usage.setStartWithWindows(settings?.startWithWindows !== true));
  const toggleCompact = async () => setSettings(await window.usage.setCompactMode(!settings?.compactMode));
  const compactMode = settings?.compactMode === true;

  return <main className={compactMode ? 'compact' : undefined} aria-busy={refreshing}>
    {alerts.map((event) => <aside key={`${event.kind}-${event.provider}-${event.bucketLabel}`} className={`usage-toast ${event.kind}`} role="status">
      {t(event.kind === 'low' ? 'lowLimitWarning' : 'availabilityRestored', {
        provider: providerName(language, event.provider), bucket: event.bucketLabel, percent: event.remainingPercent,
      })}
    </aside>)}
    <header className="titlebar">
      <div><span className="eyebrow">{t('localOverlay')}</span><h1>Remaining Usage</h1></div>
      <div className="title-actions no-drag">
        <button className="title-button compact-toggle" onClick={() => void toggleCompact()} aria-label={compactMode ? t('expanded') : t('compact')}>
          {compactMode ? '⤢' : '⤡'}
        </button>
        <button className="title-button" onClick={() => void window.usage.minimize()} aria-label={t('minimize')}>—</button>
        <button className="refresh" onClick={() => void refresh()} disabled={refreshing} aria-label={refreshing ? t('refreshing') : t('refresh')} title={refreshing ? t('refreshingDetail') : t('refresh')}>
          {refreshing ? <Spinner /> : '↻'}
        </button>
      </div>
    </header>
    <div className={refreshing ? 'refresh-bar active' : 'refresh-bar'} role="status" aria-label={refreshing ? t('refreshingDetail') : undefined}>{refreshing && <i />}</div>
    {compactMode ? <section className="compact-cards">
      {snapshots.map((snapshot) => <CompactCard key={snapshot.provider} snapshot={snapshot} language={language} refreshing={pending.includes(snapshot.provider)} state={displayState(snapshot)} />)}
    </section> : <>
      <section className="cards">
        {snapshots.map((snapshot) => <UsageCard key={snapshot.provider} snapshot={snapshot} language={language} locale={locale} refreshing={pending.includes(snapshot.provider)} now={now} state={displayState(snapshot)} onSettings={setSettings} />)}
      </section>
      <section className="workspace no-drag">
        <div><span>{t('claudeWorkspace')}</span><b title={settings?.claudeWorkspace}>{settings?.claudeWorkspace ?? t('noWorkspace')}</b></div>
        <button onClick={() => void chooseWorkspace()}>{t('chooseWorkspace')}</button>
        <p>{t('trustHint')}</p>
      </section>
      <footer className="footer no-drag">
        <label>{t('frequency')} <select value={settings?.refreshMinutes ?? 5} onChange={(event) => void updateFrequency(event)}>
          {[1, 5, 15, 30].map((minutes) => <option key={minutes} value={minutes}>{t('minutes', { count: minutes })}</option>)}
        </select></label>
        <label className="startup-toggle">
          <input type="checkbox" checked={settings?.startWithWindows === true} onChange={() => void toggleStartup()} />
          {t('startWithWindows')}
        </label>
        <span>{t('privacy')}</span>
      </footer>
    </>}
  </main>;
}

// Guarded so the module can be imported by tests without mounting the app.
const container = document.getElementById('root');
if (container) createRoot(container).render(<StrictMode><App /></StrictMode>);

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings, AvailabilityRestoredEvent, ProviderId, UsageBucket, UsageSnapshot } from '../shared/usage';
import { diagnosticLabel, languageFromLocale, providerName, stateLabel, translator, type Language } from './i18n';
import './styles.css';

function timeLabel(value: string | undefined, locale: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function resetLabel(bucket: UsageBucket, locale: string, fallback: string) {
  if (!bucket.resetAt) return bucket.resetText ?? fallback;
  return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(bucket.resetAt));
}

async function playAvailabilitySound() {
  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  await context.resume();
  for (const offset of [0, 0.24]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(offset ? 880 : 660, context.currentTime + offset);
    gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + offset + 0.19);
  }
  window.setTimeout(() => void context.close(), 700);
}

function Bucket({ bucket, language, locale }: { bucket: UsageBucket; language: Language; locale: string }) {
  const t = translator(language);
  const display = bucket.remainingPercent === undefined ? bucket.remainingText ?? t('noVerifiedData') : `${bucket.remainingPercent}%`;
  return <div className="bucket">
    <div className="usage-row"><strong>{display}</strong><span>{t('remaining')}</span></div>
    <div className="bucket-label">{bucket.label}</div>
    <div className="meta-row"><span>{t('reset')}</span><b>{resetLabel(bucket, locale, t('notReported'))}</b></div>
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

function UsageCard({ snapshot, language, locale, onSettings }: { snapshot: UsageSnapshot; language: Language; locale: string; onSettings: (settings: AppSettings) => void }) {
  const t = translator(language);
  const buckets = snapshot.buckets?.length ? snapshot.buckets : [];
  return <article className={`usage-card ${snapshot.state}`}>
    <div className="card-header">
      <span className="provider-name">{providerName(language, snapshot.provider)}</span>
      <span className="state"><i />{stateLabel(language, snapshot.state)}</span>
    </div>
    {buckets.length ? buckets.map((bucket, index) => <Bucket key={`${bucket.label}-${index}`} bucket={bucket} language={language} locale={locale} />) :
      <div className="usage-row unavailable-data"><strong>{t('noVerifiedData')}</strong></div>}
    <div className="meta-row"><span>{t('lastRead')}</span><b>{timeLabel(snapshot.observedAt ?? snapshot.checkedAt, locale)}</b></div>
    {snapshot.cliPath && <div className="meta-row"><span>{t('detectedCli')}</span><b className="cli-path" title={snapshot.cliPath}>{snapshot.cliPath}</b></div>}
    {snapshot.diagnostic && <p className="error">{diagnosticLabel(language, snapshot.diagnostic)}</p>}
    {snapshot.diagnostic === 'cli-not-found' && <CliRecovery provider={snapshot.provider} language={language} onSettings={onSettings} />}
  </article>;
}

/**
 * Claude names its windows "Current week (all models)", which overflows the
 * compact row. The full name stays in the expanded card; here only the word
 * that tells the windows apart is kept.
 */
function shortLabel(label: string): string {
  return label
    .replace(/\([^)]*\)/g, '')
    .replace(/^current\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim() || label;
}

function CompactCard({ snapshot, language }: { snapshot: UsageSnapshot; language: Language }) {
  const t = translator(language);
  const summary = (snapshot.buckets ?? [])
    .map((bucket) => bucket.remainingPercent === undefined ? undefined : `${shortLabel(bucket.label)} ${bucket.remainingPercent}%`)
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  return <article className={`compact-card ${snapshot.state}`}>
    <span className="provider-name">{providerName(language, snapshot.provider)}</span>
    <b>{summary || t('noVerifiedData')}</b>
    <span className="state"><i />{stateLabel(language, snapshot.state)}</span>
  </article>;
}

function App() {
  const [snapshots, setSnapshots] = useState<UsageSnapshot[]>([]);
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [locale, setLocale] = useState(navigator.language);
  const [refreshing, setRefreshing] = useState(false);
  const [restored, setRestored] = useState<AvailabilityRestoredEvent[]>([]);
  const language = useMemo(() => languageFromLocale(locale), [locale]);
  const t = translator(language);

  useEffect(() => {
    void window.usage.getSnapshots().then(setSnapshots);
    void window.usage.getSettings().then(setSettings);
    void window.usage.getSystemLocale().then(setLocale);
    return window.usage.onSnapshots(setSnapshots);
  }, []);

  useEffect(() => window.usage.onAvailabilityRestored((events) => {
    setRestored(events);
    void playAvailabilitySound();
    window.setTimeout(() => setRestored([]), 12_000);
  }), []);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const refresh = async () => {
    setRefreshing(true);
    try { setSnapshots(await window.usage.refresh()); }
    catch (error) { console.error('Refresh failed:', error); }
    finally { setRefreshing(false); }
  };

  const updateFrequency = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = await window.usage.setRefreshMinutes(Number(event.target.value));
    setSettings(next);
  };

  const chooseWorkspace = async () => setSettings(await window.usage.selectClaudeWorkspace());
  const toggleCompact = async () => setSettings(await window.usage.setCompactMode(!settings?.compactMode));
  const compactMode = settings?.compactMode === true;

  return <main className={compactMode ? 'compact' : undefined}>
    {restored.length > 0 && <aside className="availability-toast" role="status">
      {restored.map((event) => <div key={`${event.provider}-${event.bucketLabel}`}>
        {t('availabilityRestored', { provider: providerName(language, event.provider), bucket: event.bucketLabel, percent: event.remainingPercent })}
      </div>)}
    </aside>}
    <header className="titlebar">
      <div><span className="eyebrow">{t('localOverlay')}</span><h1>Remaining Usage</h1></div>
      <div className="title-actions no-drag">
        <button className="title-button compact-toggle" onClick={() => void toggleCompact()} aria-label={compactMode ? t('expanded') : t('compact')}>
          {compactMode ? '⤢' : '⤡'}
        </button>
        <button className="title-button" onClick={() => void window.usage.minimize()} aria-label={t('minimize')}>—</button>
        <button className="refresh" onClick={() => void refresh()} disabled={refreshing} aria-label={t('refresh')}>
          {refreshing ? '···' : '↻'}
        </button>
      </div>
    </header>
    {compactMode ? <section className="compact-cards">
      {snapshots.map((snapshot) => <CompactCard key={snapshot.provider} snapshot={snapshot} language={language} />)}
    </section> : <>
      <section className="cards">
        {snapshots.map((snapshot) => <UsageCard key={snapshot.provider} snapshot={snapshot} language={language} locale={locale} onSettings={setSettings} />)}
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
        <span>{t('privacy')}</span>
      </footer>
    </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

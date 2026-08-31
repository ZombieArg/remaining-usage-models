import { describe, expect, it } from 'vitest';
import { isStaleByAge, lowestRemainingPercent, shortBucketLabel, summarizeSnapshot, type UsageSnapshot } from './usage';

const snapshot = (overrides: Partial<UsageSnapshot> = {}): UsageSnapshot => ({
  provider: 'claude', state: 'ready', checkedAt: '2026-08-29T12:00:00.000Z', ...overrides,
});

describe('shortBucketLabel', () => {
  it('keeps only the word that tells two windows apart', () => {
    expect(shortBucketLabel('Current week (all models)')).toBe('week');
    expect(shortBucketLabel('5 h')).toBe('5 h');
  });

  it('never returns an empty label, however little survives', () => {
    expect(shortBucketLabel('(all models)')).toBe('(all models)');
  });
});

describe('summarizeSnapshot', () => {
  it('lists only the windows with a verified percentage', () => {
    const summary = summarizeSnapshot(snapshot({
      buckets: [{ label: 'Current week', remainingPercent: 64 }, { label: 'Session', remainingText: 'unknown' }],
    }));
    expect(summary).toBe('week 64%');
  });

  it('is empty when nothing verifiable was read, rather than guessing', () => {
    expect(summarizeSnapshot(snapshot({ buckets: [] }))).toBe('');
    expect(summarizeSnapshot(snapshot())).toBe('');
  });
});

describe('lowestRemainingPercent', () => {
  it('reports the tightest limit across providers, since that is the one that stops you', () => {
    expect(lowestRemainingPercent([
      snapshot({ provider: 'codex', buckets: [{ label: '5 h', remainingPercent: 80 }] }),
      snapshot({ buckets: [{ label: 'week', remainingPercent: 12 }, { label: 'session', remainingPercent: 55 }] }),
    ])).toBe(12);
  });

  it('is undefined when no percentage was verified', () => {
    expect(lowestRemainingPercent([snapshot({ buckets: [] })])).toBeUndefined();
  });
});

describe('isStaleByAge', () => {
  const observedAt = '2026-08-29T12:00:00.000Z';
  const at = (iso: string) => Date.parse(iso);

  it('treats a recent reading as current', () => {
    expect(isStaleByAge(snapshot({ observedAt }), 5, at('2026-08-29T12:10:00.000Z'))).toBe(false);
  });

  it('flags a reading older than three refresh cycles', () => {
    expect(isStaleByAge(snapshot({ observedAt }), 5, at('2026-08-29T12:20:00.000Z'))).toBe(true);
  });

  it('keeps a floor so a one-minute interval does not flap', () => {
    expect(isStaleByAge(snapshot({ observedAt }), 1, at('2026-08-29T12:10:00.000Z'))).toBe(false);
    expect(isStaleByAge(snapshot({ observedAt }), 1, at('2026-08-29T12:16:00.000Z'))).toBe(true);
  });

  it('says nothing about a snapshot that was never observed', () => {
    expect(isStaleByAge(snapshot(), 5, at('2027-01-01T00:00:00.000Z'))).toBe(false);
  });
});

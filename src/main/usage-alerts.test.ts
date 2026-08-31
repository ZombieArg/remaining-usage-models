import { describe, expect, it } from 'vitest';
import { UsageAlertTracker } from './usage-alerts';

const snapshot = (remainingPercent: number, state: 'ready' | 'stale' | 'unavailable' = 'ready') => ({
  provider: 'codex' as const, state, checkedAt: '2026-08-28T00:00:00.000Z',
  buckets: [{ label: '5 h', remainingPercent }],
});

describe('UsageAlertTracker', () => {
  it('alerts once when a verified exhausted bucket becomes available again', () => {
    const tracker = new UsageAlertTracker();
    expect(tracker.observe([snapshot(40)])).toEqual([]);
    expect(tracker.observe([snapshot(0)])).toEqual([]);
    expect(tracker.observe([snapshot(0, 'stale')])).toEqual([]);
    expect(tracker.observe([snapshot(12)])).toEqual([
      { kind: 'restored', provider: 'codex', bucketLabel: '5 h', remainingPercent: 12 },
    ]);
    expect(tracker.observe([snapshot(11)])).toEqual([]);
  });

  it('warns once per threshold as a limit drains, not once per poll', () => {
    const tracker = new UsageAlertTracker();
    expect(tracker.observe([snapshot(40)])).toEqual([]);
    expect(tracker.observe([snapshot(18)])).toEqual([
      { kind: 'low', threshold: 20, provider: 'codex', bucketLabel: '5 h', remainingPercent: 18 },
    ]);
    expect(tracker.observe([snapshot(15)])).toEqual([]);
    expect(tracker.observe([snapshot(9)])).toEqual([
      { kind: 'low', threshold: 10, provider: 'codex', bucketLabel: '5 h', remainingPercent: 9 },
    ]);
    expect(tracker.observe([snapshot(4)])).toEqual([]);
  });

  it('re-arms the warnings after the window resets', () => {
    const tracker = new UsageAlertTracker();
    tracker.observe([snapshot(8)]);
    expect(tracker.observe([snapshot(95)])).toEqual([]);
    expect(tracker.observe([snapshot(19)])).toEqual([
      { kind: 'low', threshold: 20, provider: 'codex', bucketLabel: '5 h', remainingPercent: 19 },
    ]);
  });

  it('does not warn about a limit that is already exhausted', () => {
    const tracker = new UsageAlertTracker();
    expect(tracker.observe([snapshot(0)])).toEqual([]);
  });

  it('ignores unverified readings so a failed poll never fires an alert', () => {
    const tracker = new UsageAlertTracker();
    expect(tracker.observe([snapshot(5, 'stale')])).toEqual([]);
    expect(tracker.observe([snapshot(5, 'unavailable')])).toEqual([]);
  });
});

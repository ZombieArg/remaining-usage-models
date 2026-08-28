import { describe, expect, it } from 'vitest';
import { AvailabilityAlertTracker } from './availability-alert';

const snapshot = (remainingPercent: number, state: 'ready' | 'stale' | 'unavailable' = 'ready') => ({
  provider: 'codex' as const, state, checkedAt: '2026-08-28T00:00:00.000Z',
  buckets: [{ label: '5 h', remainingPercent }],
});

describe('AvailabilityAlertTracker', () => {
  it('alerts once when a verified exhausted bucket becomes available again', () => {
    const tracker = new AvailabilityAlertTracker();
    expect(tracker.observe([snapshot(40)])).toEqual([]);
    expect(tracker.observe([snapshot(0)])).toEqual([]);
    expect(tracker.observe([snapshot(0, 'stale')])).toEqual([]);
    expect(tracker.observe([snapshot(12)])).toEqual([
      { provider: 'codex', bucketLabel: '5 h', remainingPercent: 12 },
    ]);
    expect(tracker.observe([snapshot(11)])).toEqual([]);
  });
});

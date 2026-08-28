import type { AvailabilityRestoredEvent, UsageSnapshot } from '../shared/usage';

/**
 * Arms only verified zero-percent buckets. A stale or unavailable refresh does
 * not clear the arm, so a later confirmed reset produces exactly one alert.
 */
export class AvailabilityAlertTracker {
  private exhausted = new Set<string>();

  observe(snapshots: UsageSnapshot[]): AvailabilityRestoredEvent[] {
    const restored: AvailabilityRestoredEvent[] = [];
    for (const snapshot of snapshots) {
      if (snapshot.state !== 'ready') continue;
      for (const bucket of snapshot.buckets ?? []) {
        if (bucket.remainingPercent === undefined) continue;
        const key = `${snapshot.provider}:${bucket.label}`;
        if (bucket.remainingPercent === 0) {
          this.exhausted.add(key);
        } else if (bucket.remainingPercent > 0 && this.exhausted.delete(key)) {
          restored.push({ provider: snapshot.provider, bucketLabel: bucket.label, remainingPercent: bucket.remainingPercent });
        }
      }
    }
    return restored;
  }
}

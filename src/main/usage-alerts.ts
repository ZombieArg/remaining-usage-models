import { LOW_THRESHOLDS, type UsageAlertEvent, type UsageSnapshot } from '../shared/usage';

/**
 * Turns verified readings into the two moments worth interrupting for: dropping
 * past a threshold, and an exhausted limit coming back.
 *
 * Both are armed only by verified percentages. A stale or unavailable refresh
 * never clears an arm, so a later confirmed reading produces exactly one alert
 * instead of one per failed poll.
 */
export class UsageAlertTracker {
  private exhausted = new Set<string>();
  /** Tightest threshold already announced per bucket, so a slow drain warns once. */
  private warned = new Map<string, number>();

  observe(snapshots: UsageSnapshot[]): UsageAlertEvent[] {
    const alerts: UsageAlertEvent[] = [];
    for (const snapshot of snapshots) {
      if (snapshot.state !== 'ready') continue;
      for (const bucket of snapshot.buckets ?? []) {
        const remainingPercent = bucket.remainingPercent;
        if (remainingPercent === undefined) continue;
        const key = `${snapshot.provider}:${bucket.label}`;
        const common = { provider: snapshot.provider, bucketLabel: bucket.label, remainingPercent };

        if (remainingPercent === 0) this.exhausted.add(key);
        else if (this.exhausted.delete(key)) alerts.push({ kind: 'restored', ...common });

        const crossed = LOW_THRESHOLDS.filter((threshold) => remainingPercent <= threshold);
        if (!crossed.length) {
          // Back above every threshold, which means the window reset: re-arm.
          this.warned.delete(key);
          continue;
        }
        const tightest = Math.min(...crossed);
        const alreadyWarned = this.warned.get(key);
        if (alreadyWarned !== undefined && tightest >= alreadyWarned) continue;
        this.warned.set(key, tightest);
        // Being at zero is not news the user needs a warning for; the restored
        // alert is what tells them something changed.
        if (remainingPercent > 0) alerts.push({ kind: 'low', threshold: tightest, ...common });
      }
    }
    return alerts;
  }
}

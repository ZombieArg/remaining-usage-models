import { PROVIDER_NAMES, summarizeSnapshot, type UsageSnapshot } from '../shared/usage';

/** Windows silently truncates a long tray tooltip, so the app name only leads when it fits. */
const MAX_TOOLTIP_LENGTH = 127;

/**
 * The point of a tray monitor is answering "how much is left" without opening
 * anything, so the tooltip carries the real numbers rather than the app name.
 */
export function trayTooltip(snapshots: UsageSnapshot[], noData: string): string {
  const lines = snapshots.map((snapshot) => {
    const summary = summarizeSnapshot(snapshot);
    return `${PROVIDER_NAMES[snapshot.provider]}: ${summary || noData}`;
  });
  const withTitle = ['Remaining Usage', ...lines].join('\n');
  if (withTitle.length <= MAX_TOOLTIP_LENGTH) return withTitle;
  return lines.join('\n').slice(0, MAX_TOOLTIP_LENGTH);
}

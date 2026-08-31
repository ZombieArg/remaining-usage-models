import { nativeImage } from 'electron';

/** How tight the tightest verified limit is, which is what the tray colour reports. */
export type UsageLevel = 'ok' | 'low' | 'critical' | 'unknown';

// Windows notification areas rasterize PNG reliably; SVG can leave an empty
// reserved slot on some taskbar configurations. The battery silhouette remains
// recognisable at the 16px size used by the overflow tray. Only the charge
// accent is recoloured per level, so the outline stays identical between states
// and the icon never looks like a different app.
const TRAY_ICONS: Record<UsageLevel, string> = {
  ok: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAR0lEQVR42mNgGAWjYBQwMDD8pxMY/A7gkdWlCR51AFkOCLq2EAWTKz6oHIAzUY46YNQBow4YMQ4YrQtGGySjbc9RMAoGJQAAn/xytnWW+CsAAAAASUVORK5CYII=',
  low: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAR0lEQVR42mNgGAWjYBQwMDD8pxMY/A7gkdWlCR51AFkO+HY0GAWTKz6oHIAzUY46YNQBow4YMQ4YrQtGGySjbc9RMAoGJQAA+TKTDjy2FSEAAAAASUVORK5CYII=',
  critical: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAR0lEQVR42mNgGAWjYBQwMDD8pxMY/A7gkdWlCR51AFkO+Fw/CwWTKz6oHIAzUY46YNQBow4YMQ4YrQtGGySjbc9RMAoGJQAAPyGSHtPD6dkAAAAASUVORK5CYII=',
  unknown: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAR0lEQVR42mNgGAWjYBQwMDD8pxMY/A7gkdWlCR51AFkO6Fp+BAWTKz6oHIAzUY46YNQBow4YMQ4YrQtGGySjbc9RMAoGJQAArO2HVqmzj/kAAAAASUVORK5CYII=',
};

/** Nothing verifiable stays neutral: an invented colour would be an invented reading. */
export function usageLevel(lowestRemainingPercent: number | undefined): UsageLevel {
  if (lowestRemainingPercent === undefined) return 'unknown';
  if (lowestRemainingPercent <= 10) return 'critical';
  if (lowestRemainingPercent <= 20) return 'low';
  return 'ok';
}

export function createTrayIcon(level: UsageLevel = 'unknown') {
  return nativeImage.createFromBuffer(Buffer.from(TRAY_ICONS[level], 'base64'));
}

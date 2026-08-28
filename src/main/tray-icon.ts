import { nativeImage } from 'electron';

// Windows notification areas rasterize PNG reliably; SVG can leave an empty
// reserved slot on some taskbar configurations. The battery silhouette remains
// recognisable at the 16px size used by the overflow tray.
const TRAY_ICON_PNG = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABfSURBVFhH7c7BCYAwEETRKcAWcvFu/4XYR1rQkwsOOYWsRPIf5BIW5ksAJF0f8d3gh1l8NzwHWzlSHgFdAftZX6/3f6oARwABBKwXEIOuFTDy/Scgm+8GP8ziuwCmcAMVyX7mWLgVmAAAAABJRU5ErkJggg==';

export function createTrayIcon() {
  return nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG, 'base64'));
}

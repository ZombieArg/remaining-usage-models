import { app } from 'electron';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSettings } from '../shared/usage';

const DEFAULT_SETTINGS: AppSettings = {
  refreshMinutes: 5,
  compactMode: false,
  startWithWindows: false,
  cliPaths: {},
};

export class SettingsStore {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private readonly filePath: string;

  /** The path is injectable so the store can be exercised against a temp directory. */
  constructor(filePath = join(app.getPath('userData'), 'settings.json')) {
    this.filePath = filePath;
    this.settings = this.load();
  }

  get(): AppSettings {
    return structuredClone(this.settings);
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...patch, cliPaths: { ...this.settings.cliPaths, ...patch.cliPaths } };
    // Written aside and renamed over: a crash mid-write would otherwise leave
    // truncated JSON, and load() would silently fall back to defaults, losing
    // the pinned CLI paths and the chosen workspace.
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.settings, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
    return this.get();
  }

  private load(): AppSettings {
    if (!existsSync(this.filePath)) return { ...DEFAULT_SETTINGS };
    try {
      const candidate = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppSettings>;
      const refreshMinutes = Number.isInteger(candidate.refreshMinutes) && candidate.refreshMinutes! >= 1 && candidate.refreshMinutes! <= 60
        ? candidate.refreshMinutes!
        : DEFAULT_SETTINGS.refreshMinutes;
      return {
        ...DEFAULT_SETTINGS, ...candidate, refreshMinutes,
        compactMode: candidate.compactMode === true,
        startWithWindows: candidate.startWithWindows === true,
        cliPaths: candidate.cliPaths ?? {},
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}

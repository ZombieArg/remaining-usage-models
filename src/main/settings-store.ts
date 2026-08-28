import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSettings } from '../shared/usage';

const DEFAULT_SETTINGS: AppSettings = {
  refreshMinutes: 5,
  compactMode: false,
  cliPaths: {},
};

export class SettingsStore {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private readonly filePath: string;

  constructor() {
    this.filePath = join(app.getPath('userData'), 'settings.json');
    this.settings = this.load();
  }

  get(): AppSettings {
    return structuredClone(this.settings);
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...patch, cliPaths: { ...this.settings.cliPaths, ...patch.cliPaths } };
    writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf8');
    return this.get();
  }

  private load(): AppSettings {
    if (!existsSync(this.filePath)) return { ...DEFAULT_SETTINGS };
    try {
      const candidate = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppSettings>;
      const refreshMinutes = Number.isInteger(candidate.refreshMinutes) && candidate.refreshMinutes! >= 1 && candidate.refreshMinutes! <= 60
        ? candidate.refreshMinutes!
        : DEFAULT_SETTINGS.refreshMinutes;
      return { ...DEFAULT_SETTINGS, ...candidate, refreshMinutes, compactMode: candidate.compactMode === true, cliPaths: candidate.cliPaths ?? {} };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SettingsStore } from './settings-store';

// The store reads its default location from Electron, which is not running
// here. vi.mock is hoisted above this import, so the stub is in place first.
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const directories: string[] = [];
const settingsPath = () => {
  const directory = mkdtempSync(join(tmpdir(), 'remaining-usage-'));
  directories.push(directory);
  return join(directory, 'settings.json');
};

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('round-trips a change through the file', () => {
    const path = settingsPath();
    new SettingsStore(path).update({ refreshMinutes: 15, claudeWorkspace: 'C:\\project' });

    const reloaded = new SettingsStore(path).get();
    expect(reloaded.refreshMinutes).toBe(15);
    expect(reloaded.claudeWorkspace).toBe('C:\\project');
  });

  it('merges pinned CLI paths instead of replacing the whole map', () => {
    const store = new SettingsStore(settingsPath());
    store.update({ cliPaths: { codex: 'C:\\codex.exe' } });
    const settings = store.update({ cliPaths: { claude: 'C:\\claude.exe' } });
    expect(settings.cliPaths).toEqual({ codex: 'C:\\codex.exe', claude: 'C:\\claude.exe' });
  });

  it('leaves no partial file behind, so a crash mid-write cannot lose the settings', () => {
    const path = settingsPath();
    new SettingsStore(path).update({ refreshMinutes: 30 });
    // The temporary file is renamed over the real one, never left next to it.
    expect(() => readFileSync(`${path}.tmp`, 'utf8')).toThrow();
    expect(JSON.parse(readFileSync(path, 'utf8')).refreshMinutes).toBe(30);
  });

  it('falls back to defaults rather than throwing on a corrupt file', () => {
    const path = settingsPath();
    writeFileSync(path, '{ "refreshMinutes": ', 'utf8');
    expect(new SettingsStore(path).get().refreshMinutes).toBe(5);
  });

  it('rejects an out-of-range interval that reached the file some other way', () => {
    const path = settingsPath();
    writeFileSync(path, JSON.stringify({ refreshMinutes: 9_000 }), 'utf8');
    expect(new SettingsStore(path).get().refreshMinutes).toBe(5);
  });
});

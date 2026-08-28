import { describe, expect, it } from 'vitest';
import { PROVIDERS, PROVIDER_NAMES } from '../shared/usage';
import { PROVIDER_DEFINITIONS, PROVIDER_REGISTRY } from './provider-registry';

const env = { USERPROFILE: 'C:\\Users\\Test', LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local' };

describe('provider registry', () => {
  it('defines every provider exactly once, in listed order', () => {
    expect(Object.keys(PROVIDER_REGISTRY).sort()).toEqual([...PROVIDERS].sort());
    expect(PROVIDER_DEFINITIONS.map((definition) => definition.id)).toEqual([...PROVIDERS]);
  });

  it('gives every provider its own name, command and install folders', () => {
    const names = PROVIDERS.map((id) => PROVIDER_NAMES[id]);
    const commands = PROVIDERS.map((id) => PROVIDER_REGISTRY[id].commandName);
    // A ternary fallthrough would make a provider share another's identity.
    expect(new Set(names).size).toBe(PROVIDERS.length);
    expect(new Set(commands).size).toBe(PROVIDERS.length);
    for (const id of PROVIDERS) {
      expect(PROVIDER_NAMES[id], id).toBeTruthy();
      expect(PROVIDER_REGISTRY[id].knownFolders(env).length, id).toBeGreaterThan(0);
    }
  });

  it('keeps each read function bound to its own provider', async () => {
    const settings = { refreshMinutes: 5, compactMode: false, cliPaths: {}, claudeWorkspace: 'C:\\w' };
    const seen: string[] = [];
    const context = {
      command: 'fake',
      settings,
      statusProbe: async () => { seen.push('pty'); return { screen: 'Session limit: 50% remaining' }; },
      codexProbe: async () => { seen.push('app-server'); return { buckets: [{ label: '5 h', remainingPercent: 50 }] }; },
    };

    await PROVIDER_REGISTRY.codex.read(context);
    expect(seen).toEqual(['app-server']);

    seen.length = 0;
    await PROVIDER_REGISTRY.claude.read(context);
    expect(seen).toEqual(['pty']);
  });

  it('omits folders whose environment variable is unset', () => {
    for (const id of PROVIDERS) expect(PROVIDER_REGISTRY[id].knownFolders({}), id).toEqual([]);
  });
});

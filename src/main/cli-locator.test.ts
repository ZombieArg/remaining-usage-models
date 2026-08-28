import { describe, expect, it } from 'vitest';
import { findCliCandidates, knownLocationCandidates, locateCli, rankPathResults, type LocatorDeps } from './cli-locator';

const SANDBOX = 'C:\\Users\\Test\\.codex\\.sandbox-bin\\codex.exe';
const env = { USERPROFILE: 'C:\\Users\\Test', LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local' };
const deps = (overrides: Partial<LocatorDeps> = {}): LocatorDeps => ({
  runWhere: async () => { throw new Error('not on PATH'); },
  exists: () => false,
  env,
  ...overrides,
});

describe('rankPathResults', () => {
  it('prefers a real executable over the npm shim listed first', () => {
    const stdout = 'C:\\npm\\codex\r\nC:\\npm\\codex.cmd\r\nC:\\tools\\codex.exe\r\n';
    expect(rankPathResults(stdout)).toEqual(['C:\\tools\\codex.exe', 'C:\\npm\\codex.cmd', 'C:\\npm\\codex']);
  });

  it('ignores blank and padded lines from where.exe', () => {
    expect(rankPathResults('\r\n  C:\\tools\\claude.exe  \r\n\r\n')).toEqual(['C:\\tools\\claude.exe']);
  });
});

describe('knownLocationCandidates', () => {
  it('covers the sandbox-bin install that is not on PATH', () => {
    expect(knownLocationCandidates('codex', env)).toContain(SANDBOX);
  });

  it('skips locations whose environment variable is unset', () => {
    expect(knownLocationCandidates('claude', {})).toEqual([]);
  });
});

describe('locateCli', () => {
  it('honours a pinned path without touching PATH', async () => {
    const pinned = 'C:\\custom\\codex.exe';
    await expect(locateCli('codex', pinned, deps({ exists: (value) => value === pinned }))).resolves.toBe(pinned);
  });

  it('ignores a pinned path that no longer exists and heals itself', async () => {
    await expect(locateCli('codex', 'C:\\gone\\codex.exe', deps({ exists: (value) => value === SANDBOX }))).resolves.toBe(SANDBOX);
  });

  it('falls back to a known install location when where.exe finds nothing', async () => {
    await expect(locateCli('codex', undefined, deps({ exists: (value) => value === SANDBOX }))).resolves.toBe(SANDBOX);
  });

  it('reports cli-not-found rather than a generic failure', async () => {
    await expect(locateCli('codex', undefined, deps())).rejects.toThrow('cli-not-found');
  });
});

describe('findCliCandidates', () => {
  it('merges PATH and known locations without duplicates', async () => {
    const candidates = await findCliCandidates('codex', deps({
      runWhere: async () => `${SANDBOX}\r\n`,
      exists: (value) => value === SANDBOX,
    }));
    expect(candidates).toEqual([SANDBOX]);
  });

  it('still offers known locations when the CLI is off PATH', async () => {
    await expect(findCliCandidates('codex', deps({ exists: (value) => value === SANDBOX }))).resolves.toEqual([SANDBOX]);
  });
});

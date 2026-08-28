import { describe, expect, it } from 'vitest';
import { ProviderService, type CodexProbe, type StatusProbe } from './provider-service';
import type { CliLocator } from './cli-locator';

const settings = () => ({
  refreshMinutes: 5,
  compactMode: false,
  cliPaths: { codex: 'fake-codex', claude: 'fake-claude' },
  claudeWorkspace: 'C:\\project',
});

describe('ProviderService', () => {
  it('normalizes real-like screens and keeps the last verified result after a timeout', async () => {
    let shouldTimeoutCodex = false;
    const probe: StatusProbe = async (options) => {
      return { screen: 'Claude usage\nSession limit: 64% remaining. Resets at 18:00' };
    };
    const codexProbe: CodexProbe = async () => {
      if (shouldTimeoutCodex) throw new Error('timeout');
      return { buckets: [{ label: '5 h', remainingPercent: 80, resetText: '4 hours' }] };
    };
    const service = new ProviderService(settings, probe, codexProbe);

    await service.refreshAll();
    expect(service.getSnapshots()).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'codex', state: 'ready', remainingPercent: 80, resetText: '4 hours' }),
      expect.objectContaining({ provider: 'claude', state: 'ready', remainingPercent: 64, resetText: '18:00' }),
    ]));

    shouldTimeoutCodex = true;
    await service.refreshAll();
    expect(service.getSnapshots()).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'codex', state: 'stale', remainingPercent: 80, diagnostic: 'timeout' }),
    ]));
  });

  it('reports a missing CLI as cli-not-found instead of a generic probe failure', async () => {
    const unconfigured = () => ({ refreshMinutes: 5, compactMode: false, cliPaths: {}, claudeWorkspace: 'C:' });
    const probe: StatusProbe = async () => ({ screen: '' });
    const codexProbe: CodexProbe = async () => ({ buckets: [] });
    const locator: CliLocator = async () => { throw new Error('cli-not-found'); };
    const service = new ProviderService(unconfigured, probe, codexProbe, locator);

    await service.refreshAll();
    expect(service.getSnapshots()).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'codex', state: 'unavailable', diagnostic: 'cli-not-found' }),
    ]));
  });

  it('retries Codex once when the app server is slow to come up', async () => {
    let attempts = 0;
    const probe: StatusProbe = async () => ({ screen: '' });
    const codexProbe: CodexProbe = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('timeout');
      return { buckets: [{ label: '5 h', remainingPercent: 88 }] };
    };
    const service = new ProviderService(settings, probe, codexProbe);

    await service.refreshAll();
    expect(attempts).toBe(2);
    expect(service.getSnapshots()).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'codex', state: 'ready', remainingPercent: 88 }),
    ]));
  });

  it('gives up after the retry and keeps reporting the timeout', async () => {
    let attempts = 0;
    const probe: StatusProbe = async () => ({ screen: '' });
    const codexProbe: CodexProbe = async () => { attempts += 1; throw new Error('timeout'); };
    const service = new ProviderService(settings, probe, codexProbe);

    await service.refreshAll();
    expect(attempts).toBe(2);
    expect(service.getSnapshots()).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'codex', state: 'unavailable', diagnostic: 'timeout' }),
    ]));
  });

  it('does not start Claude before a workspace is explicitly selected', async () => {
    const noWorkspace = () => ({ refreshMinutes: 5, compactMode: false, cliPaths: { claude: 'fake-claude' } });
    const probe: StatusProbe = async () => ({ screen: 'Claude usage 80% remaining' });
    const codexProbe: CodexProbe = async () => ({ buckets: [{ label: '5 h', remainingPercent: 80 }] });
    const service = new ProviderService(noWorkspace, probe, codexProbe);
    await service.refreshAll();
    expect(service.getSnapshots()).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'claude', state: 'unavailable', diagnostic: 'workspace-required' }),
    ]));
  });
});

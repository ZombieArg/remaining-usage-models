import { existsSync } from 'node:fs';
import { DIAGNOSTIC_CODES, PROVIDERS, type AppSettings, type ProviderId, type UsageSnapshot } from '../shared/usage';
import { runUsageProbe } from './pty-probe';
import { readCodexRateLimits } from './codex-app-server';
import { locateCli, type CliLocator } from './cli-locator';
import { PROVIDER_REGISTRY, type CodexProbe, type StatusProbe } from './provider-registry';

export type { CodexProbe, StatusProbe };

export class ProviderService {
  private snapshots = new Map<ProviderId, UsageSnapshot>();
  private resolvedCommands = new Map<ProviderId, string>();
  /** Per-provider scratch space that survives refreshes, such as which probe worked last. */
  private readonly memos = new Map<ProviderId, Map<string, string>>();

  constructor(
    private readonly getSettings: () => AppSettings,
    private readonly statusProbe: StatusProbe = runUsageProbe,
    private readonly codexProbe: CodexProbe = readCodexRateLimits,
    private readonly locator: CliLocator = locateCli,
  ) {
    for (const provider of PROVIDERS) {
      this.snapshots.set(provider, {
        provider, state: 'unavailable', checkedAt: new Date().toISOString(), diagnostic: 'not-checked',
      });
    }
  }

  /** Drops the discovery cache so the next refresh honours a newly pinned path. */
  forgetResolvedCommand(provider?: ProviderId): void {
    if (provider) this.resolvedCommands.delete(provider);
    else this.resolvedCommands.clear();
  }

  getSnapshots(): UsageSnapshot[] {
    return PROVIDERS.map((provider) => this.snapshots.get(provider)!);
  }

  /**
   * Providers answer at very different speeds: Codex over JSON-RPC in seconds,
   * Claude through a full terminal session. `onSettled` fires per provider so a
   * fast card is never held back by a slow one.
   */
  async refreshAll(onSettled?: (snapshot: UsageSnapshot) => void): Promise<UsageSnapshot[]> {
    await Promise.all(PROVIDERS.map(async (provider) => {
      await this.refreshProvider(provider);
      onSettled?.(this.snapshots.get(provider)!);
    }));
    return this.getSnapshots();
  }

  private async refreshProvider(provider: ProviderId): Promise<void> {
    const previous = this.snapshots.get(provider)!;
    const checkedAt = new Date().toISOString();
    try {
      const command = await this.findCommand(provider);
      const parsed = await PROVIDER_REGISTRY[provider].read({
        command, settings: this.getSettings(), statusProbe: this.statusProbe, codexProbe: this.codexProbe,
        memo: this.memoFor(provider),
      });
      const first = parsed.buckets[0];
      this.snapshots.set(provider, {
        provider,
        state: 'ready',
        buckets: parsed.buckets,
        remainingPercent: first?.remainingPercent,
        remainingText: first?.remainingText,
        resetText: first?.resetText,
        cliPath: command,
        observedAt: checkedAt,
        checkedAt,
      });
    } catch (cause) {
      const diagnostic = this.diagnosticFor(cause);
      this.snapshots.set(provider, previous.state === 'ready' || previous.state === 'stale'
        ? { ...previous, state: 'stale', checkedAt, diagnostic }
        : { provider, state: 'unavailable', checkedAt, diagnostic });
    }
  }

  private memoFor(provider: ProviderId): Map<string, string> {
    const existing = this.memos.get(provider);
    if (existing) return existing;
    const memo = new Map<string, string>();
    this.memos.set(provider, memo);
    return memo;
  }

  private diagnosticFor(cause: unknown): UsageSnapshot['diagnostic'] {
    const value = cause instanceof Error ? cause.message : '';
    if ((DIAGNOSTIC_CODES as readonly string[]).includes(value)) {
      return value as UsageSnapshot['diagnostic'];
    }
    if (/not recognized|could not find|ENOENT|no está instalado/i.test(value)) return 'cli-not-found';
    return 'probe-failed';
  }

  private async findCommand(provider: ProviderId): Promise<string> {
    const cached = this.resolvedCommands.get(provider);
    if (cached && existsSync(cached)) return cached;
    this.resolvedCommands.delete(provider);
    const command = await this.locator(provider, this.getSettings().cliPaths[provider]);
    this.resolvedCommands.set(provider, command);
    return command;
  }
}

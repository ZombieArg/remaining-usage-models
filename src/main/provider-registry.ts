import { join } from 'node:path';
import { PROVIDERS, type AppSettings, type ProviderId } from '../shared/usage';
import { hasAuthenticationPrompt, parseUsageStatus, type ParsedUsage } from './parsers';
import type { PtyProbeOptions, PtyProbeResult } from './pty-probe';
import type { readCodexRateLimits } from './codex-app-server';

export type StatusProbe = (options: PtyProbeOptions) => Promise<PtyProbeResult>;
export type CodexProbe = (command: string) => ReturnType<typeof readCodexRateLimits>;

export interface ProviderReadContext {
  command: string;
  settings: AppSettings;
  statusProbe: StatusProbe;
  codexProbe: CodexProbe;
}

export interface ProviderDefinition {
  /** Passed to `where.exe`, and the executable name looked for in known folders. */
  commandName: string;
  /** Install locations that ship the binary outside PATH. */
  knownFolders(env: NodeJS.ProcessEnv): string[];
  /** Reads verified plan windows, throwing a DiagnosticCode as the error message. */
  read(context: ProviderReadContext): Promise<ParsedUsage>;
}

function present(...candidates: (string | undefined)[]): string[] {
  return candidates.filter((value): value is string => Boolean(value));
}

/** Turns a probe result into buckets, throwing the diagnostic the screen implies. */
function parseProbe(provider: ProviderId, result: PtyProbeResult) {
  if (result.trustRequired) throw new Error('trust-required');
  if (result.timedOut) throw new Error('timeout');
  if (hasAuthenticationPrompt(result.screen)) throw new Error('login-required');
  return parseUsageStatus(provider, result.screen);
}

function probeDiagnostic(result: PtyProbeResult): string {
  if (result.trustRequired) return 'trust-required';
  if (result.timedOut) return 'timeout';
  if (hasAuthenticationPrompt(result.screen)) return 'login-required';
  return 'incompatible-output';
}

/**
 * Every provider the app can monitor. Typed as a total record over ProviderId,
 * so adding an id to PROVIDERS fails the build until its definition exists. A
 * new provider can no longer fall through to another one's probe, install
 * folders or display name the way a two-branch ternary allowed.
 */
export const PROVIDER_REGISTRY: Record<ProviderId, ProviderDefinition> = {
  codex: {
    commandName: 'codex',
    knownFolders: (env) => present(
      env.USERPROFILE && join(env.USERPROFILE, '.codex', '.sandbox-bin'),
      env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'codex'),
      env.USERPROFILE && join(env.USERPROFILE, '.local', 'bin'),
      env.ProgramFiles && join(env.ProgramFiles, 'codex'),
    ),
    read: async ({ command, codexProbe }) => {
      try {
        return await codexProbe(command);
      } catch (cause) {
        // The app server can be slow to come up, so a lone timeout is retried once.
        if (!(cause instanceof Error) || cause.message !== 'timeout') throw cause;
        return codexProbe(command);
      }
    },
  },
  claude: {
    commandName: 'claude',
    knownFolders: (env) => present(
      env.USERPROFILE && join(env.USERPROFILE, '.local', 'bin'),
      env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'claude'),
      env.USERPROFILE && join(env.USERPROFILE, '.claude', 'bin'),
      env.ProgramFiles && join(env.ProgramFiles, 'claude'),
    ),
    read: async ({ command, settings, statusProbe }) => {
      if (!settings.claudeWorkspace) throw new Error('workspace-required');
      const cwd = settings.claudeWorkspace;
      const readyPattern = /(?:What can I help|[›❯])/u;
      const first = await statusProbe({ command, cwd, readyPattern, commandText: '/status\r' });
      const parsed = parseProbe('claude', first);
      if (parsed) return parsed;

      // Claude versions differ: /status can omit plan windows while /usage exposes them.
      const second = await statusProbe({ command, cwd, readyPattern, commandText: '/usage\r' });
      const fallback = parseProbe('claude', second);
      if (fallback) return fallback;
      throw new Error(probeDiagnostic(second));
    },
  },
};

/** Iteration order for refreshes and for the cards in the window. */
export const PROVIDER_DEFINITIONS = PROVIDERS.map((id) => ({ id, ...PROVIDER_REGISTRY[id] }));

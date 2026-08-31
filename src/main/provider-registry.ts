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
  /** Survives refreshes, so a provider can skip work it already knows is wasted. */
  memo: Map<string, string>;
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

export const CLAUDE_COMMAND_MEMO = 'claude-usage-command';
const CLAUDE_COMMANDS: PtyProbeOptions['commandText'][] = ['/status\r', '/usage\r'];

/**
 * Claude versions differ: /status can omit plan windows while /usage exposes
 * them. Each probe opens a whole terminal session, so the command that worked
 * last time goes first and the usual refresh pays for one instead of two.
 */
function claudeCommandOrder(remembered: string | undefined): PtyProbeOptions['commandText'][] {
  const first = CLAUDE_COMMANDS.find((candidate) => candidate === remembered);
  return first ? [first, ...CLAUDE_COMMANDS.filter((candidate) => candidate !== first)] : CLAUDE_COMMANDS;
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
    read: async ({ command, settings, statusProbe, memo }) => {
      if (!settings.claudeWorkspace) throw new Error('workspace-required');
      const cwd = settings.claudeWorkspace;
      const readyPattern = /(?:What can I help|[›❯])/u;
      let last: PtyProbeResult | undefined;
      for (const commandText of claudeCommandOrder(memo.get(CLAUDE_COMMAND_MEMO))) {
        last = await statusProbe({ command, cwd, readyPattern, commandText });
        const parsed = parseProbe('claude', last);
        if (parsed) {
          memo.set(CLAUDE_COMMAND_MEMO, commandText);
          return parsed;
        }
      }
      throw new Error(probeDiagnostic(last!));
    },
  },
};

/** Iteration order for refreshes and for the cards in the window. */
export const PROVIDER_DEFINITIONS = PROVIDERS.map((id) => ({ id, ...PROVIDER_REGISTRY[id] }));

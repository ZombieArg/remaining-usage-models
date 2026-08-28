import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ProviderId } from '../shared/usage';
import { PROVIDER_REGISTRY } from './provider-registry';

const execFileAsync = promisify(execFile);

export interface LocatorDeps {
  /** Resolves the raw stdout of `where.exe <provider>`; rejects when nothing matches. */
  runWhere: (provider: ProviderId) => Promise<string>;
  exists: (path: string) => boolean;
  env: NodeJS.ProcessEnv;
}

export type CliLocator = (provider: ProviderId, configured?: string) => Promise<string>;

const defaultRunWhere: LocatorDeps['runWhere'] = async (provider) => {
  const name = PROVIDER_REGISTRY[provider].commandName;
  const { stdout } = await execFileAsync('where.exe', [name], { windowsHide: true, timeout: 3_000 });
  return stdout;
};

export const defaultDeps: LocatorDeps = { runWhere: defaultRunWhere, exists: existsSync, env: process.env };

/**
 * `where.exe` lists every match in PATH order, and an npm install puts the
 * extensionless shell script first. Real executables are preferred because the
 * probes spawn the command directly, without a shell.
 */
export function rankPathResults(stdout: string): string[] {
  const weight = (value: string) => {
    const lower = value.toLocaleLowerCase();
    if (lower.endsWith('.exe')) return 0;
    if (lower.endsWith('.cmd') || lower.endsWith('.bat')) return 1;
    return 2;
  };
  return stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value, index) => ({ value, index }))
    .sort((a, b) => weight(a.value) - weight(b.value) || a.index - b.index)
    .map((entry) => entry.value);
}

/**
 * Only real executables are proposed: the probes spawn without a shell, so a
 * .cmd shim here would trade a "not found" for an EINVAL on Node >= 20.12.
 */
export function knownLocationCandidates(provider: ProviderId, env: NodeJS.ProcessEnv): string[] {
  const definition = PROVIDER_REGISTRY[provider];
  return definition.knownFolders(env).map((folder) => join(folder, `${definition.commandName}.exe`));
}

/** Every install this machine actually has, for the recovery picker in the UI. */
export async function findCliCandidates(provider: ProviderId, deps: LocatorDeps = defaultDeps): Promise<string[]> {
  const found: string[] = [];
  try {
    for (const candidate of rankPathResults(await deps.runWhere(provider))) found.push(candidate);
  } catch { /* not on PATH; known locations still apply */ }
  for (const candidate of knownLocationCandidates(provider, deps.env)) {
    if (deps.exists(candidate)) found.push(candidate);
  }
  return [...new Set(found.map((value) => value.trim()))];
}

/**
 * Resolution order: the path the user pinned, then PATH, then known install
 * locations. Throws 'cli-not-found' so the caller reports the real reason.
 */
export async function locateCli(provider: ProviderId, configured?: string, deps: LocatorDeps = defaultDeps): Promise<string> {
  if (configured && deps.exists(configured)) return configured;
  try {
    const [best] = rankPathResults(await deps.runWhere(provider));
    if (best) return best;
  } catch { /* normalized below */ }
  for (const candidate of knownLocationCandidates(provider, deps.env)) {
    if (deps.exists(candidate)) return candidate;
  }
  throw new Error('cli-not-found');
}

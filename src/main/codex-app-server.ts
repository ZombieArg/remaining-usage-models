import { spawn } from 'node:child_process';
import type { ParsedUsage } from './parsers';

/**
 * How this app introduces itself to the local app server. The version is
 * duplicated from package.json because tsconfig pins rootDir to src, so a test
 * asserts the two stay equal rather than letting them drift apart.
 */
export const CLIENT_INFO = { name: 'remaining-usage-models', version: '0.2.1' } as const;

interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
}

interface RateLimitSnapshot {
  limitId?: string | null;
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
}

interface RateLimitResponse {
  rateLimits?: RateLimitSnapshot;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot> | null;
}

function windowLabel(minutes: number | null | undefined, index: number): string {
  if (!minutes) return index === 0 ? 'Primary limit' : 'Secondary limit';
  if (minutes % 1_440 === 0) return `${minutes / 1_440} d`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

/** Validates the app-server response before turning it into visible plan buckets. */
export function parseCodexRateLimits(response: RateLimitResponse): ParsedUsage | null {
  const snapshots = response.rateLimitsByLimitId && Object.keys(response.rateLimitsByLimitId).length
    ? Object.values(response.rateLimitsByLimitId)
    : response.rateLimits ? [response.rateLimits] : [];
  const buckets: ParsedUsage['buckets'] = [];
  for (const snapshot of snapshots) {
    for (const [index, window] of [snapshot.primary, snapshot.secondary].entries()) {
      if (!window || !Number.isInteger(window.usedPercent) || window.usedPercent < 0 || window.usedPercent > 100) continue;
      const resetAt = typeof window.resetsAt === 'number' && Number.isFinite(window.resetsAt)
        ? new Date(window.resetsAt * 1_000).toISOString()
        : undefined;
      const label = windowLabel(window.windowDurationMins, index);
      if (buckets.some((bucket) => bucket.label === label)) continue;
      buckets.push({ label, remainingPercent: 100 - window.usedPercent, resetAt });
    }
  }
  return buckets.length ? { buckets } : null;
}

/**
 * Requests only account/rateLimits/read from the already authenticated local
 * Codex app server. It never reads auth files or invokes account mutations.
 */
export function readCodexRateLimits(command: string, timeoutMs = 12_000): Promise<ParsedUsage> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['app-server'], {
      cwd: process.env.USERPROFILE ?? process.cwd(), windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'], env: process.env,
    });
    let buffer = '';
    let stderrText = '';
    let settled = false;
    /** Keeps the concrete cause (spawn error, exit code, stderr, JSON-RPC error text) visible instead of collapsing every failure into the same opaque code. */
    const probeFailed = (detail?: string) => new Error('probe-failed', detail ? { cause: detail } : undefined);
    const finish = (value?: ParsedUsage, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      if (error) reject(error); else resolve(value!);
    };
    const timeout = setTimeout(() => finish(undefined, new Error('timeout')), timeoutMs);
    child.once('error', (err) => finish(undefined, probeFailed(err.message)));
    child.once('exit', (code) => finish(undefined, probeFailed(
      [code !== null ? `exit code ${code}` : undefined, stderrText.trim()].filter(Boolean).join(': ') || undefined,
    )));
    child.stderr.on('data', (data: Buffer) => { stderrText += data.toString('utf8'); });
    child.stdout.on('data', (data: Buffer) => {
      buffer += data.toString('utf8');
      if (buffer.length > 250_000) return finish(undefined, probeFailed('response exceeded 250KB without completing'));
      let delimiter: number;
      while ((delimiter = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, delimiter).trim();
        buffer = buffer.slice(delimiter + 1);
        if (!line) continue;
        let message: { id?: number; result?: unknown; error?: { message?: string } };
        try { message = JSON.parse(line) as typeof message; } catch { continue; }
        if (message.id === 1) {
          child.stdin.write(`${JSON.stringify({ id: 2, method: 'account/rateLimits/read' })}\n`);
          continue;
        }
        if (message.id === 2) {
          const parsed = parseCodexRateLimits(message.result as RateLimitResponse);
          finish(parsed ?? undefined, parsed ? undefined : new Error('incompatible-output'));
          continue;
        }
        if (message.error) {
          finish(undefined, /auth|login|sign in/i.test(message.error.message ?? '')
            ? new Error('login-required')
            : probeFailed(message.error.message));
        }
      }
    });
    child.stdin.write(`${JSON.stringify({
      id: 1,
      method: 'initialize',
      params: { clientInfo: CLIENT_INFO, capabilities: { experimentalApi: true } },
    })}\n`);
  });
}

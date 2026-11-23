import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_INFO, parseCodexRateLimits, readCodexRateLimits } from './codex-app-server';

describe('Codex app-server rate limits', () => {
  it('turns explicit primary and secondary account windows into remaining buckets', () => {
    expect(parseCodexRateLimits({
      rateLimits: {
        primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: 1_787_903_500 },
        secondary: { usedPercent: 16, windowDurationMins: 10_080, resetsAt: 1_788_470_181 },
      },
    })?.buckets).toEqual([
      { label: '5 h', remainingPercent: 95, resetAt: '2026-08-28T07:51:40.000Z' },
      { label: '7 d', remainingPercent: 84, resetAt: '2026-09-03T21:16:21.000Z' },
    ]);
  });

  it('rejects missing or unsafe rate-limit values', () => {
    expect(parseCodexRateLimits({ rateLimits: { primary: { usedPercent: 101 } } })).toBeNull();
  });
});

describe('readCodexRateLimits failure detail', () => {
  // Node itself stands in for the CLI here, per CONTRIBUTING.md: tests must not
  // depend on a real provider CLI being installed on the machine that runs them.
  it('carries the spawn error as the diagnostic detail instead of a bare probe-failed', async () => {
    await expect(readCodexRateLimits('C:\\definitely\\does-not-exist\\codex.exe', 5_000)).rejects.toMatchObject({
      message: 'probe-failed',
      cause: expect.stringContaining('ENOENT'),
    });
  });

  it('carries the exit code and stderr when the process exits without ever answering', async () => {
    // `node app-server` fails fast: Node treats the fixed arg as a missing script
    // and exits non-zero with a message on stderr, exactly like a CLI too old to
    // understand the app-server subcommand would.
    await expect(readCodexRateLimits(process.execPath, 5_000)).rejects.toMatchObject({
      message: 'probe-failed',
      cause: expect.stringContaining('exit code'),
    });
  });
});

describe('client identity', () => {
  it('introduces itself with the shipped version, which a release bump must not leave behind', () => {
    const { name, version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(CLIENT_INFO).toEqual({ name, version });
  });
});

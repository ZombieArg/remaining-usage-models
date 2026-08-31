import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_INFO, parseCodexRateLimits } from './codex-app-server';

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

describe('client identity', () => {
  it('introduces itself with the shipped version, which a release bump must not leave behind', () => {
    const { name, version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(CLIENT_INFO).toEqual({ name, version });
  });
});

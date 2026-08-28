import { describe, expect, it } from 'vitest';
import { hasAuthenticationPrompt, hasTrustPrompt, parseUsageStatus, stripAnsi } from './parsers';

describe('terminal screen parsing', () => {
  it('removes ANSI presentation bytes from terminal fixtures', () => {
    expect(stripAnsi('\u001b[32mCodex\u001b[0m 73% remaining')).toBe('Codex 73% remaining');
  });

  it('reads multiple explicit limits and ignores session context', () => {
    const screen = [
      'Codex usage',
      '5-hour limit: 73% remaining | Resets in 2 hours',
      'Weekly limit: 41% used | Resets on Monday',
      '100% context left',
    ].join('\n');
    expect(parseUsageStatus('codex', screen)?.buckets).toEqual([
      { label: '5-hour limit', remainingPercent: 73, resetText: '2 hours' },
      { label: 'Weekly limit', remainingPercent: 59, resetText: 'Monday' },
    ]);
  });

  it('names Claude windows by their heading instead of the drawn bar', () => {
    // Verbatim from `claude /usage` (v2.1.79): the bar is decoration on the
    // percentage line, and the window name sits on the line above it.
    const screen = [
      '   Status   Config   Usage ',
      '  Current session    ',
      '  ███████████▌                                       23% used',
      '  Resets 4:40pm (America/Buenos_Aires)',
      '  Current week (all models)',
      '  █▌                                                 3% used',
      '  Resets Sep 3, 8pm (America/Buenos_Aires)',
      '  Extra usage not enabled - /extra-usage to enable',
    ].join('\n');
    expect(parseUsageStatus('claude', screen)?.buckets).toEqual([
      { label: 'Current session', remainingPercent: 77, resetText: '4:40pm (America/Buenos_Aires)' },
      { label: 'Current week (all models)', remainingPercent: 97, resetText: 'Sep 3, 8pm (America/Buenos_Aires)' },
    ]);
  });

  it('gives each window its own reset instead of the first one on screen', () => {
    const screen = ['Weekly limit', '███ 10% used', 'Resets Monday'].join('\n');
    expect(parseUsageStatus('claude', screen)?.buckets).toEqual([
      { label: 'Weekly limit', remainingPercent: 90, resetText: 'Monday' },
    ]);
  });

  it('rejects unauthenticated, trust and incompatible responses', () => {
    expect(hasAuthenticationPrompt('Please sign in to use Codex')).toBe(true);
    expect(hasTrustPrompt('Quick safety check: Yes, I trust this folder')).toBe(true);
    expect(parseUsageStatus('claude', 'Claude is ready\n100% context left')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { UsageSnapshot } from '../shared/usage';
import { trayTooltip } from './tray-tooltip';
import { usageLevel } from './tray-icon';

const snapshot = (provider: UsageSnapshot['provider'], buckets: UsageSnapshot['buckets']): UsageSnapshot =>
  ({ provider, state: 'ready', buckets, checkedAt: '2026-01-01T00:00:00.000Z' });

describe('tray tooltip', () => {
  it('reports the verified percentages so the window never has to be opened', () => {
    const tooltip = trayTooltip([
      snapshot('codex', [{ label: '5 h', remainingPercent: 80 }]),
      snapshot('claude', [{ label: 'Current week (all models)', remainingPercent: 64 }]),
    ], 'no data');

    expect(tooltip).toBe('Remaining Usage\nCodex: 5 h 80%\nClaude: week 64%');
  });

  it('says there is no data instead of inventing a number', () => {
    const tooltip = trayTooltip([snapshot('codex', [])], 'sin dato');
    expect(tooltip).toContain('Codex: sin dato');
  });

  it('stays within the length Windows will render', () => {
    const long = Array.from({ length: 8 }, (_, index) => ({ label: `Very long window name ${index}`, remainingPercent: index }));
    expect(trayTooltip([snapshot('codex', long)], 'no data').length).toBeLessThanOrEqual(127);
  });
});

describe('tray icon level', () => {
  it('maps the tightest limit to a colour, and nothing verified to neutral', () => {
    expect(usageLevel(undefined)).toBe('unknown');
    expect(usageLevel(0)).toBe('critical');
    expect(usageLevel(10)).toBe('critical');
    expect(usageLevel(11)).toBe('low');
    expect(usageLevel(20)).toBe('low');
    expect(usageLevel(21)).toBe('ok');
  });
});

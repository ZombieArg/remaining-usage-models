// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { UsageSnapshot } from '../shared/usage';
import { CompactCard, UsageCard } from './main';

// Vitest runs without global injection, so auto-cleanup has to be wired by hand
// or every render piles up in the same document.
afterEach(cleanup);

const snapshot = (overrides: Partial<UsageSnapshot> = {}): UsageSnapshot => ({
  provider: 'codex',
  state: 'ready',
  buckets: [{ label: '5 h', remainingPercent: 64 }],
  observedAt: '2026-08-29T12:00:00.000Z',
  checkedAt: '2026-08-29T12:00:00.000Z',
  ...overrides,
});

const card = (props: Partial<Parameters<typeof UsageCard>[0]> = {}) =>
  render(<UsageCard
    snapshot={snapshot()} language="es" locale="es-AR" refreshing={false}
    now={Date.parse('2026-08-29T12:01:00.000Z')} state="ready" onSettings={() => {}}
    {...props}
  />);

describe('UsageCard', () => {
  it('says it is querying the CLI while that provider is being read', () => {
    card({ refreshing: true });
    expect(screen.getByText('Consultando')).toBeTruthy();
    expect(screen.queryByText('Actualizado')).toBeNull();
  });

  it('shows the settled state once the read is done', () => {
    card();
    expect(screen.getByText('Actualizado')).toBeTruthy();
    expect(screen.queryByText('Consultando')).toBeNull();
  });

  it('keeps the last verified percentage visible on a stale card', () => {
    card({ snapshot: snapshot({ state: 'stale', diagnostic: 'timeout' }), state: 'stale' });
    expect(screen.getByText('64%')).toBeTruthy();
    expect(screen.getByText('Último dato conservado')).toBeTruthy();
  });

  it('explains the diagnostic instead of leaving a card blank', () => {
    card({ snapshot: snapshot({ state: 'unavailable', buckets: [], diagnostic: 'login-required' }), state: 'unavailable' });
    expect(screen.getByText('Sin dato verificable')).toBeTruthy();
    expect(screen.getByText('La CLI requiere iniciar sesión.')).toBeTruthy();
  });

  it('counts down to a reset the provider timestamped, keeping the exact time on hover', () => {
    const resetAt = '2026-08-29T15:00:00.000Z';
    card({
      snapshot: snapshot({ buckets: [{ label: '5 h', remainingPercent: 64, resetAt }] }),
      now: Date.parse('2026-08-29T12:00:00.000Z'),
    });
    const reset = screen.getByText(/dentro de 3 horas|en 3 horas/);
    expect(reset.getAttribute('title')).toBeTruthy();
  });

  it('repeats a free-text reset verbatim rather than inventing a countdown', () => {
    card({ snapshot: snapshot({ buckets: [{ label: 'Current week', remainingPercent: 64, resetText: 'Monday 9am' }] }) });
    expect(screen.getByText('Monday 9am')).toBeTruthy();
  });
});

describe('CompactCard', () => {
  it('condenses every verified window into one line', () => {
    render(<CompactCard language="es" refreshing={false} state="ready" snapshot={snapshot({
      buckets: [{ label: 'Current week (all models)', remainingPercent: 64 }, { label: 'Session', remainingPercent: 20 }],
    })} />);
    expect(screen.getByText('week 64% · Session 20%')).toBeTruthy();
  });
});

import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../shared/usage';
import { diagnosticLabel, languageFromLocale, translator } from './i18n';

describe('system language', () => {
  it('uses Spanish for Argentina and English as fallback', () => {
    expect(languageFromLocale('es-AR')).toBe('es');
    expect(languageFromLocale('en-US')).toBe('en');
    expect(translator('es')('minimize')).toContain('Minimizar');
  });
});

describe('diagnostic labels', () => {
  it('explains every diagnostic code in both languages', () => {
    for (const code of DIAGNOSTIC_CODES) {
      for (const language of ['es', 'en'] as const) {
        expect(diagnosticLabel(language, code), `${language}/${code}`).toBeTruthy();
      }
    }
  });

  it('names the real cause when the CLI is missing from PATH', () => {
    expect(diagnosticLabel('en', 'cli-not-found')).toContain('PATH');
    expect(diagnosticLabel('es', 'cli-not-found')).toContain('PATH');
  });
});

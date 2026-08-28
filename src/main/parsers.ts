import type { ProviderId, UsageBucket } from '../shared/usage';

export interface ParsedUsage {
  buckets: UsageBucket[];
}

/** Removes residual SGR bytes from fixtures or CLIs that do not use a full terminal repaint. */
export function stripAnsi(value: string): string {
  return value
    .replace(/\u001B(?:[@-_][0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g, '')
    .replace(/[\u0000\r]/g, '');
}

function cleanLines(raw: string): string[] {
  return stripAnsi(raw)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function validPercent(value: string | undefined): number | undefined {
  const percent = value === undefined ? Number.NaN : Number(value);
  return Number.isInteger(percent) && percent >= 0 && percent <= 100 ? percent : undefined;
}

/**
 * Claude draws a used-percentage bar out of block glyphs on the same line as the
 * number, and names the window on the line above. Those glyphs are decoration,
 * not a label, and they read backwards next to a remaining percentage.
 */
const BAR_GLYPHS = /[\u2500-\u259F]+/g;
const RESET_PATTERN = /\b(?:reset(?:s|ting)?|renews?|available again)\b/i;

function textOf(line: string): string {
  return line.replace(BAR_GLYPHS, ' ').replace(/\s+/g, ' ').trim();
}

function labelFor(line: string, heading?: string): string {
  const beforeValue = textOf(line.replace(/\b\d{1,3}\s*%.*$/i, ''))
    .replace(/^(?:usage|limit)\s*[:|-]?\s*/i, '')
    .trim()
    .replace(/[|:–—-]+$/g, '')
    .trim();
  return beforeValue || heading || 'Plan usage';
}

/** A section title such as "Current week (all models)" that names the bar below it. */
function isHeading(line: string): boolean {
  const text = textOf(line);
  return Boolean(text)
    && !/\d{1,3}\s*%/.test(text)
    && !RESET_PATTERN.test(text)
    && /[a-z]/i.test(text);
}

function resetFor(line: string, allLines: string[], index: number): string | undefined {
  let source: string | undefined;
  if (RESET_PATTERN.test(line)) source = line;
  else {
    // Claude prints the reset under its bar, so take the one belonging to this
    // window rather than the first reset anywhere on the screen.
    for (const candidate of allLines.slice(index + 1)) {
      if (/\d{1,3}\s*%/.test(candidate)) break;
      if (RESET_PATTERN.test(candidate)) { source = candidate; break; }
    }
  }
  if (!source) return undefined;
  const match = source.match(/\b(?:reset(?:s|ting)?|renews?|available again)\s*(?:in|at|on)?\s*([^|]+)/i);
  return match?.[1]?.trim().replace(/[.,;]+$/, '') || undefined;
}

/** Accepts only explicit plan limits. Session/context-window output is deliberately ignored. */
export function parseUsageStatus(_provider: ProviderId, rawScreen: string): ParsedUsage | null {
  const lines = cleanLines(rawScreen);
  if (!lines.length || hasAuthenticationPrompt(lines.join('\n'))) return null;

  const buckets: UsageBucket[] = [];
  let heading: string | undefined;
  for (const [index, line] of lines.entries()) {
    if (/\b(?:context|token window|context left)\b/i.test(line)) continue;
    if (!/\b(?:usage|limit|quota|remaining|left|available|used|utili[sz]ed)\b/i.test(line)) {
      if (isHeading(line)) heading = labelFor(line);
      continue;
    }

    const remaining = validPercent(line.match(/\b(\d{1,3})\s*%\s*(?:remaining|left|available)\b/i)?.[1]);
    const used = validPercent(line.match(/\b(\d{1,3})\s*%\s*(?:used|utili[sz]ed)\b/i)?.[1]);
    const percent = remaining ?? (used === undefined ? undefined : 100 - used);
    if (percent === undefined) {
      if (isHeading(line)) heading = labelFor(line);
      continue;
    }

    const label = labelFor(line, heading);
    heading = undefined;
    if (buckets.some((bucket) => bucket.label.toLocaleLowerCase() === label.toLocaleLowerCase())) continue;
    buckets.push({ label, remainingPercent: percent, resetText: resetFor(line, lines, index) });
  }

  return buckets.length ? { buckets } : null;
}

export function hasAuthenticationPrompt(screen: string): boolean {
  return /(?:sign in|log in|authentication (?:is )?required|not authenticated|please authenticate)/i.test(screen);
}

export function hasTrustPrompt(screen: string): boolean {
  return /(?:quick safety check|trust this folder|yes,? i trust this folder|accessing workspace)/i.test(screen);
}

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeError, FileLogger } from './logger';

const directories: string[] = [];
const logPath = () => {
  const directory = mkdtempSync(join(tmpdir(), 'remaining-usage-log-'));
  directories.push(directory);
  // A missing folder is created on first write, as on a fresh install.
  return join(directory, 'logs', 'main.log');
};

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('FileLogger', () => {
  it('appends timestamped lines in order', async () => {
    const path = logPath();
    const logger = new FileLogger(path);
    void logger.log('first');
    await logger.log('second');

    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.* first$/);
    expect(lines[1]).toMatch(/ second$/);
  });

  it('rolls the file over to a single .1 sibling past the size limit', async () => {
    const path = logPath();
    const logger = new FileLogger(path, 100);
    for (const index of [1, 2, 3, 4, 5]) await logger.log(`entry ${index} ${'x'.repeat(30)}`);

    expect(existsSync(`${path}.1`)).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('entry 5');
    expect(readFileSync(path, 'utf8').length).toBeLessThanOrEqual(100);
  });
});

describe('describeError', () => {
  it('keeps the cause a probe failure carries', () => {
    expect(describeError(new Error('probe-failed', { cause: 'exit code 1' }))).toMatch(/^probe-failed \(cause: exit code 1\)/);
    expect(describeError('plain')).toBe('plain');
  });
});

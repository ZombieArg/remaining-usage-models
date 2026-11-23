import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * The packaged app has no console, so a hang or a failed read used to leave no
 * trace. Lines are appended asynchronously and in order, and the file rolls over
 * to a single `.1` sibling so it never grows without bound.
 */
export class FileLogger {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string, private readonly maxBytes = 1_000_000) {}

  log(message: string): Promise<void> {
    const line = `${new Date().toISOString()} ${message}\n`;
    // Logging must never become the next failure, so write errors are dropped.
    this.queue = this.queue.then(() => this.write(line)).catch(() => undefined);
    return this.queue;
  }

  private async write(line: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const size = await stat(this.filePath).then((info) => info.size, () => 0);
    if (size > 0 && size + Buffer.byteLength(line) > this.maxBytes) await rename(this.filePath, `${this.filePath}.1`);
    await appendFile(this.filePath, line, 'utf8');
  }
}

/** One line per error, keeping the cause that probe failures carry. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause === undefined ? '' : ` (cause: ${String(error.cause)})`;
  return `${error.message}${cause}${error.stack ? `\n${error.stack}` : ''}`;
}

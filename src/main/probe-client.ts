import type { ParsedUsage } from './parsers';
import type { CodexProbe, StatusProbe } from './provider-registry';
import type { PtyProbeOptions, PtyProbeResult } from './pty-probe';

/** How long a Claude terminal session may take before the probe gives up on its own. */
export const STATUS_PROBE_TIMEOUT_MS = 35_000;
/** How long the Codex app server may take to answer before the probe gives up on its own. */
export const CODEX_PROBE_TIMEOUT_MS = 12_000;
/**
 * Extra time past a probe's own deadline before the host is presumed stuck.
 * A probe that is merely slow reports its own timeout well within this margin.
 */
export const WATCHDOG_MARGIN_MS = 10_000;

export type ProbeRequestBody =
  | { kind: 'status'; options: PtyProbeOptions }
  | { kind: 'codex'; command: string; timeoutMs: number };
export type ProbeRequest = ProbeRequestBody & { id: number };
export type ProbeReply =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; message: string; cause?: string };

/** The part of Electron's UtilityProcess the client uses, so tests can stand in for it. */
export interface ProbeHostProcess {
  postMessage(message: ProbeRequest): void;
  on(event: 'message' | 'exit', listener: (value: any) => void): unknown;
  kill(): boolean;
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  watchdog: NodeJS.Timeout;
}

/**
 * Runs the probes in a separate process. node-pty makes native ConPTY calls
 * that can block. When they ran in the main process they froze the window and
 * the tray, and Windows reported the app as not responding. Now a stuck probe
 * can only stall the host, and the watchdog replaces the host so the next
 * refresh starts clean.
 */
export class ProbeHostClient {
  private host: ProbeHostProcess | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly fork: () => ProbeHostProcess,
    private readonly log: (message: string) => void = () => undefined,
  ) {}

  readonly statusProbe: StatusProbe = (options) => {
    // The deadline is fixed here rather than left to the probe's default, so
    // the host and the watchdog always agree on it.
    const timeoutMs = options.timeoutMs ?? STATUS_PROBE_TIMEOUT_MS;
    const label = `status ${options.commandText.trim()}`;
    return this.request({ kind: 'status', options: { ...options, timeoutMs } }, timeoutMs, label) as Promise<PtyProbeResult>;
  };

  readonly codexProbe: CodexProbe = (command) =>
    this.request({ kind: 'codex', command, timeoutMs: CODEX_PROBE_TIMEOUT_MS }, CODEX_PROBE_TIMEOUT_MS, 'codex') as Promise<ParsedUsage>;

  /** Stops the host and fails whatever it was still doing. */
  dispose(): void {
    this.stop(new Error('probe-failed', { cause: 'probe host stopped' }));
  }

  private request(body: ProbeRequestBody, timeoutMs: number, label: string): Promise<unknown> {
    const id = this.nextId++;
    const host = this.ensureHost();
    const startedAt = Date.now();
    const budget = timeoutMs + WATCHDOG_MARGIN_MS;
    const outcome = new Promise<unknown>((resolve, reject) => {
      const watchdog = setTimeout(() => {
        this.log(`probe host unresponsive for ${budget} ms during ${label}; restarting it`);
        this.stop(new Error('timeout', { cause: 'probe host unresponsive; restarted' }));
      }, budget);
      this.pending.set(id, { resolve, reject, watchdog });
    });
    host.postMessage({ id, ...body });
    outcome.then(
      () => this.log(`${label} ok in ${Date.now() - startedAt} ms`),
      (error: Error) => this.log(`${label} failed in ${Date.now() - startedAt} ms: ${error.message}${error.cause ? ` (${String(error.cause)})` : ''}`),
    );
    return outcome;
  }

  private ensureHost(): ProbeHostProcess {
    if (this.host) return this.host;
    const host = this.fork();
    host.on('message', (reply: ProbeReply) => this.settle(reply));
    host.on('exit', (code: number) => {
      // A host the watchdog already replaced has nothing left to fail.
      if (this.host !== host) return;
      this.host = undefined;
      this.log(`probe host exited with code ${code}`);
      this.rejectAll(new Error('probe-failed', { cause: `probe host exited with code ${code}` }));
    });
    this.host = host;
    return host;
  }

  private settle(reply: ProbeReply): void {
    const entry = this.pending.get(reply.id);
    if (!entry) return;
    this.pending.delete(reply.id);
    clearTimeout(entry.watchdog);
    if (reply.ok) entry.resolve(reply.value);
    else entry.reject(new Error(reply.message, reply.cause === undefined ? undefined : { cause: reply.cause }));
  }

  private stop(error: Error): void {
    const host = this.host;
    this.host = undefined;
    try { host?.kill(); } catch { /* already gone */ }
    this.rejectAll(error);
  }

  private rejectAll(error: Error): void {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      clearTimeout(entry.watchdog);
      entry.reject(error);
    }
  }
}

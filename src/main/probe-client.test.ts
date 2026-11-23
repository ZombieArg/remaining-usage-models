import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODEX_PROBE_TIMEOUT_MS, ProbeHostClient, STATUS_PROBE_TIMEOUT_MS, WATCHDOG_MARGIN_MS, type ProbeHostProcess, type ProbeRequest } from './probe-client';

/** Stands in for the utility process: records requests and lets the test answer them. */
class FakeHost extends EventEmitter implements ProbeHostProcess {
  readonly requests: ProbeRequest[] = [];
  killed = false;
  postMessage(message: ProbeRequest) { this.requests.push(message); }
  kill() { this.killed = true; return true; }
}

function setup() {
  const hosts: FakeHost[] = [];
  const log = vi.fn();
  const client = new ProbeHostClient(() => {
    const host = new FakeHost();
    hosts.push(host);
    return host;
  }, log);
  return { client, hosts, log };
}

const statusOptions = { command: 'claude.exe', cwd: 'C:\\project', commandText: '/usage\r' as const, readyPattern: /❯/u };

afterEach(() => { vi.useRealTimers(); });

describe('ProbeHostClient', () => {
  it('starts the host on first use and resolves each reply by id', async () => {
    const { client, hosts } = setup();
    expect(hosts).toHaveLength(0);

    const codex = client.codexProbe('codex.exe');
    const status = client.statusProbe(statusOptions);
    expect(hosts).toHaveLength(1);
    const [codexRequest, statusRequest] = hosts[0].requests;
    expect(codexRequest).toMatchObject({ kind: 'codex', command: 'codex.exe', timeoutMs: CODEX_PROBE_TIMEOUT_MS });
    // The deadline is pinned in the request so the host and the watchdog agree on it.
    expect(statusRequest).toMatchObject({ kind: 'status', options: { timeoutMs: STATUS_PROBE_TIMEOUT_MS } });

    hosts[0].emit('message', { id: statusRequest.id, ok: true, value: { screen: 'usage' } });
    hosts[0].emit('message', { id: codexRequest.id, ok: true, value: { buckets: [] } });
    await expect(status).resolves.toEqual({ screen: 'usage' });
    await expect(codex).resolves.toEqual({ buckets: [] });
  });

  it('rebuilds a failure with the diagnostic as message and the detail as cause', async () => {
    const { client, hosts } = setup();
    const codex = client.codexProbe('codex.exe');
    hosts[0].emit('message', { id: hosts[0].requests[0].id, ok: false, message: 'probe-failed', cause: 'exit code 1: boom' });

    const error = await codex.catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ message: 'probe-failed', cause: 'exit code 1: boom' });
  });

  it('kills a host that stops answering and starts a fresh one for the next probe', async () => {
    vi.useFakeTimers();
    const { client, hosts, log } = setup();
    const stuck = client.statusProbe(statusOptions);
    const alongside = client.codexProbe('codex.exe');
    const outcomes = Promise.allSettled([stuck, alongside]);

    vi.advanceTimersByTime(CODEX_PROBE_TIMEOUT_MS + WATCHDOG_MARGIN_MS);
    const [stuckOutcome, alongsideOutcome] = await outcomes;
    expect(hosts[0].killed).toBe(true);
    // Everything the stuck host held fails as a timeout, which keeps the last value as stale.
    expect(stuckOutcome).toMatchObject({ status: 'rejected', reason: { message: 'timeout' } });
    expect(alongsideOutcome).toMatchObject({ status: 'rejected', reason: { message: 'timeout' } });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('unresponsive'));

    void client.codexProbe('codex.exe').catch(() => undefined);
    expect(hosts).toHaveLength(2);
    // The replaced host exiting afterwards must not fail the new host's work.
    hosts[0].emit('exit', 1);
    hosts[1].emit('message', { id: hosts[1].requests[0].id, ok: true, value: { buckets: [] } });
    expect(hosts[1].killed).toBe(false);
  });

  it('fails pending probes when the host exits on its own', async () => {
    const { client, hosts } = setup();
    const status = client.statusProbe(statusOptions);
    hosts[0].emit('exit', 3);

    await expect(status).rejects.toMatchObject({ message: 'probe-failed', cause: 'probe host exited with code 3' });
    void client.codexProbe('codex.exe').catch(() => undefined);
    expect(hosts).toHaveLength(2);
  });

  it('stops the host on dispose', async () => {
    const { client, hosts } = setup();
    const codex = client.codexProbe('codex.exe');
    client.dispose();

    expect(hosts[0].killed).toBe(true);
    await expect(codex).rejects.toMatchObject({ message: 'probe-failed' });
  });
});

import { readCodexRateLimits } from './codex-app-server';
import type { ProbeReply, ProbeRequest } from './probe-client';
import { runUsageProbe } from './pty-probe';

/**
 * Entry point of the Electron utility process that runs the probes. This is
 * the only process that loads node-pty, so a ConPTY call that blocks stalls
 * this process and leaves the window alone. The main process replaces it when
 * that happens.
 */
const port = process.parentPort;

async function handle(request: ProbeRequest): Promise<ProbeReply> {
  try {
    const value = request.kind === 'status'
      ? await runUsageProbe(request.options)
      : await readCodexRateLimits(request.command, request.timeoutMs);
    return { id: request.id, ok: true, value };
  } catch (error) {
    // An Error does not cross the process boundary intact. Its message is the
    // diagnostic code and its cause is the visible detail, so both are sent as is.
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && typeof error.cause === 'string' ? error.cause : undefined;
    return { id: request.id, ok: false, message, cause };
  }
}

port.on('message', ({ data }: { data: ProbeRequest }) => {
  void handle(data).then((reply) => port.postMessage(reply));
});

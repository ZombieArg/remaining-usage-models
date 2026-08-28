import * as pty from 'node-pty';
import { Terminal } from '@xterm/headless';
import { hasTrustPrompt } from './parsers';

export interface PtyProbeOptions {
  command: string;
  cwd: string;
  commandText: '/usage\r' | '/status\r';
  readyPattern: RegExp;
  /** Optional fixed menu choice, sent only after the exact expected read-only menu is rendered. */
  followUp?: { promptPattern: RegExp; input: string };
  timeoutMs?: number;
}

export interface PtyProbeResult {
  /** Final ANSI-emulated screen. Raw terminal bytes never leave this module. */
  screen: string;
  timedOut?: boolean;
  trustRequired?: boolean;
  exitCode?: number;
}

function screenText(terminal: Terminal): string {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let index = 0; index < buffer.length; index += 1) {
    const line = buffer.getLine(index)?.translateToString(true);
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Opens an isolated terminal and submits a fixed internal slash command only
 * after the CLI's visible ready prompt. It never confirms dialogs or sends a model prompt.
 */
export function runUsageProbe(options: PtyProbeOptions): Promise<PtyProbeResult> {
  const timeoutMs = options.timeoutMs ?? 35_000;
  return new Promise((resolve, reject) => {
    const terminalScreen = new Terminal({
      cols: 140, rows: 50, scrollback: 120, allowProposedApi: true, windowsPty: { backend: 'conpty' },
    });
    let terminal: pty.IPty | undefined;
    let rawLength = 0;
    let settled = false;
    let commandSent = false;
    let followUpSent = false;
    let settleTimer: NodeJS.Timeout | undefined;

    const finish = (result: Omit<PtyProbeResult, 'screen'>, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (settleTimer) clearTimeout(settleTimer);
      try { terminal?.kill(); } catch { /* process already stopped */ }
      const full = { ...result, screen: screenText(terminalScreen) };
      terminalScreen.dispose();
      if (error) reject(error); else resolve(full);
    };

    const deadline = setTimeout(() => finish({ timedOut: true }), timeoutMs);
    try {
      terminal = pty.spawn(options.command, [], {
        name: 'xterm-256color', cols: 140, rows: 50, cwd: options.cwd,
        env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>, useConpty: true,
      });
    } catch (cause) {
      clearTimeout(deadline);
      terminalScreen.dispose();
      reject(cause instanceof Error ? cause : new Error(String(cause)));
      return;
    }

    terminal.onData((chunk) => {
      rawLength += chunk.length;
      if (rawLength > 250_000) return finish({}, new Error('probe-output-too-large'));
      terminalScreen.write(chunk, () => {
        if (settled) return;
        const screen = screenText(terminalScreen);
        if (hasTrustPrompt(screen)) return finish({ trustRequired: true });
        if (!commandSent && options.readyPattern.test(screen)) {
          commandSent = true;
          terminal?.write(options.commandText);
          return;
        }
        if (commandSent && !followUpSent && options.followUp?.promptPattern.test(screen)) {
          followUpSent = true;
          terminal?.write(options.followUp.input);
          return;
        }
        if (commandSent && (!options.followUp || followUpSent) && /\b(?:usage|limit|quota|remaining|left|available|used|utili[sz]ed|sign in|log in)\b/i.test(screen)) {
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => finish({}), 900);
        }
      });
    });
    terminal.onExit(({ exitCode }) => finish({ exitCode }));
  });
}

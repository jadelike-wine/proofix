/**
 * Command runner: executes the acceptance/setup/regression commands inside
 * an isolated worktree with a timeout, output capture, and a scrubbed
 * environment so test subprocesses cannot silently read credentials.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { CommandResult, RunOutcome, StageResult } from './types.js';

const MAX_CAPTURE = 512 * 1024; // 512 KiB tail per stream

/**
 * Env vars that must never reach an untrusted test subprocess.
 * Strong indicators match anywhere in the name; `auth` matches as a
 * prefix or suffix (e.g. `OAUTH_TOKEN` is already caught by `token`).
 */
const SENSITIVE_ENV =
  /token|secret|password|passwd|api[-_]?key|private[-_]?key|access[-_]?key|credential|bearer|cookie|session[-_]?id|conn(ection)?[-_]?str|database[-_]?url|db[-_]?url|(^|_)auth(_|$)/i;

/** Build a scrubbed environment for the test subprocess. */
export function scrubEnv(extraAllowed: string[] = []): NodeJS.ProcessEnv {
  const allow = new Set(extraAllowed.map((s) => s.toUpperCase()));
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (SENSITIVE_ENV.test(k) && !allow.has(k.toUpperCase())) continue;
    env[k] = v;
  }
  // Neutralise git automation side-effects inside test runs.
  env['GIT_TERMINAL_PROMPT'] = '0';
  env['CI'] = env['CI'] ?? 'true';
  return env;
}

function tail(s: string, max = MAX_CAPTURE): string {
  return Buffer.byteLength(s, 'utf8') <= max ? s : s.slice(-max);
}

/** Run `command` inside `cwd` through the platform shell with a timeout. */
export function runCommand(params: {
  command: string;
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  onData?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}): Promise<CommandResult> {
  const { command, cwd, timeoutMs } = params;
  const started = Date.now();
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const child = spawn(command, {
      cwd: path.resolve(cwd),
      shell: isWin ? 'cmd.exe' : '/bin/sh',
      env: params.env ?? scrubEnv(),
      windowsHide: true,
      // POSIX: make the child a process-group leader so the timeout can kill
      // the whole group (-pid), not just the shell wrapper.
      detached: !isWin,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (isWin) {
        // Kill the whole process TREE — child.kill() would only terminate
        // cmd.exe and orphan grandchildren (the actual test processes).
        try {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        } catch {
          try {
            child.kill('SIGKILL');
          } catch {
            /* already dead */
          }
        }
      } else {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          try {
            child.kill('SIGKILL');
          } catch {
            /* already dead */
          }
        }
      }
    }, timeoutMs);

    const finish = (exitCode: number | null, spawnError?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        exitCode,
        timedOut,
        stdout: tail(stdout),
        stderr: tail(stderr),
        durationMs: Date.now() - started,
        spawnError,
      });
    };

    child.stdout?.on('data', (d) => {
      const s = d.toString();
      stdout = tail(stdout + s);
      params.onData?.(s, 'stdout');
    });
    child.stderr?.on('data', (d) => {
      const s = d.toString();
      stderr = tail(stderr + s);
      params.onData?.(s, 'stderr');
    });
    child.on('error', (err) => finish(null, err.message));
    child.on('close', (code) => finish(code));

    // POSIX: detached children keep the parent alive via the pipe handles
    // only — no unref needed; the 'close' event still fires normally.
  });
}

/** Classify a CommandResult into a RunOutcome. */
export function classify(result: CommandResult): RunOutcome {
  if (result.spawnError !== undefined) return 'error';
  if (result.timedOut) return 'timeout';
  return result.exitCode === 0 ? 'pass' : 'fail';
}

/**
 * Heuristic: does this failure look environmental rather than a real test
 * failure? Scans stderr only — a legitimate assertion message on stdout may
 * mention filesystem/network errors (e.g. a bug in fs-handling code) and must
 * not be misclassified as an environment problem.
 */
export function looksEnvironmental(result: CommandResult): boolean {
  const hay = result.stderr.toLowerCase();
  return (
    /command not found|is not recognized|enoent|econnrefused|econnreset|etimedout|network|eai_again|enotfound/.test(hay) ||
    /cannot find module|modulenotfounderror|no such file or directory/.test(hay) ||
    /permission denied|eacces|eperm/.test(hay)
  );
}

export function stageOf(result: CommandResult, note?: string): StageResult {
  return { outcome: classify(result), command: result, note };
}

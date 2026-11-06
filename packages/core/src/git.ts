/**
 * Git helpers: revision resolution, worktree lifecycle, diffs.
 * All mutating operations stay inside dedicated worktree directories —
 * the user's working tree is never modified.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ProofixError } from './types.js';

const execFileP = promisify(execFile);

export interface GitRunOptions {
  cwd: string;
  /** Allowed failure: return result instead of throwing. */
  allowFail?: boolean;
  maxBuffer?: number;
}

export async function git(args: string[], opts: GitRunOptions): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileP('git', args, {
      cwd: opts.cwd,
      maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
      windowsHide: true,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString(), code: 0 };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    if (opts.allowFail) {
      return { stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? e.message ?? '', code: e.code ?? 1 };
    }
    throw new ProofixError(`git ${args.join(' ')} failed: ${e.stderr?.toString().trim() || e.message}`, 'io');
  }
}

export async function gitVersion(): Promise<string> {
  try {
    const { stdout } = await execFileP('git', ['--version'], { windowsHide: true });
    return stdout.toString().trim();
  } catch {
    return 'unavailable';
  }
}

/** Resolve `repo` to the repository root; throws when not inside a work tree. */
export async function repoRoot(repo: string): Promise<string> {
  const abs = path.resolve(repo);
  const res = await git(['rev-parse', '--show-toplevel'], { cwd: abs, allowFail: true });
  if (res.code !== 0 || !res.stdout.trim()) {
    throw new ProofixError(`${abs} is not inside a git repository`, 'not-a-repo');
  }
  return res.stdout.trim();
}

export interface ResolvedRev {
  sha: string;
  subject: string;
}

/** Resolve a revision expression to a commit sha + subject. */
export async function resolveRev(root: string, rev: string): Promise<ResolvedRev> {
  const res = await git(['rev-parse', '--verify', `${rev}^{commit}`], { cwd: root, allowFail: true });
  if (res.code !== 0 || !res.stdout.trim()) {
    throw new ProofixError(`cannot resolve revision "${rev}"`, 'bad-revision');
  }
  const sha = res.stdout.trim();
  const subj = await git(['log', '-1', '--format=%s', sha], { cwd: root, allowFail: true });
  return { sha, subject: subj.stdout.trim() };
}

/** Files changed between two revisions (name-only, repo-relative). */
export async function changedFiles(root: string, baseSha: string, headSha: string): Promise<string[]> {
  const res = await git(['diff', '--name-only', '-z', baseSha, headSha], { cwd: root, allowFail: true });
  if (res.code !== 0) return [];
  return res.stdout.split('\0').filter((s) => s.length > 0);
}

/** Unified diff between two revisions, truncated to `maxBytes`. */
export async function diffBetween(
  root: string,
  baseSha: string,
  headSha: string,
  maxBytes = 256 * 1024,
): Promise<{ diff: string; truncated: boolean }> {
  const res = await git(['diff', baseSha, headSha], { cwd: root, allowFail: true, maxBuffer: 64 * 1024 * 1024 });
  const diff = res.stdout;
  if (Buffer.byteLength(diff, 'utf8') <= maxBytes) return { diff, truncated: false };
  return { diff: diff.slice(0, maxBytes), truncated: true };
}

/**
 * Create a detached worktree for `sha` under `dir`.
 * Uses `--detach` so no branch is created or moved.
 */
export async function addWorktree(root: string, dir: string, sha: string): Promise<void> {
  await fs.mkdir(path.dirname(dir), { recursive: true });
  const res = await git(['worktree', 'add', '--detach', '--force', dir, sha], { cwd: root, allowFail: true });
  if (res.code !== 0) {
    throw new ProofixError(`git worktree add ${dir} ${sha} failed: ${res.stderr.trim()}`, 'worktree-failed');
  }
}

/** Remove a worktree; tolerates already-removed directories. */
export async function removeWorktree(root: string, dir: string): Promise<void> {
  await git(['worktree', 'remove', '--force', dir], { cwd: root, allowFail: true });
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** `git ls-files -s` — path → index mode (catches exec-bit flips). */
export async function lsFilesModes(worktreeDir: string, patterns: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (patterns.length === 0) return map;
  const res = await git(['ls-files', '-s', '-z', '--', ...patterns], { cwd: worktreeDir, allowFail: true });
  if (res.code !== 0) return map;
  for (const rec of res.stdout.split('\0').filter(Boolean)) {
    // format: "<mode> <object> <stage>\t<path>"
    const tab = rec.indexOf('\t');
    if (tab === -1) continue;
    const mode = rec.slice(0, rec.indexOf(' '));
    map.set(rec.slice(tab + 1), mode);
  }
  return map;
}

/** List files in a worktree matching git's own pathspec (uses git ls-files). */
export async function listFiles(worktreeDir: string, patterns: string[]): Promise<string[]> {
  if (patterns.length === 0) return [];
  const res = await git(['ls-files', '-z', '--', ...patterns], { cwd: worktreeDir, allowFail: true });
  if (res.code !== 0) return [];
  return res.stdout.split('\0').filter((s) => s.length > 0);
}

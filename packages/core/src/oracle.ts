/**
 * Frozen oracle: SHA-256 manifest of every file the acceptance verdict may
 * depend on. Frozen before any run; re-checked after each run to detect a
 * candidate fix that edits, deletes, skips, or adds tests.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { listFiles } from './git.js';
import type { OracleCheck, OracleFileEntry, OracleManifest } from './types.js';

/**
 * Default git pathspec globs identifying oracle (test) files — including the
 * config files that can silently change what the test run means: conftest.py
 * controls pytest fixtures, jest/vitest/mocha configs can exclude or rewrite
 * tests, pytest.ini/pyproject/setup.cfg carry pytest settings.
 */
export const DEFAULT_ORACLE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/testdata/**',
  '**/*_test.go',
  '**/test_*.py',
  '**/conftest.py',
  '**/conftest.*',
  '**/jest.config.*',
  '**/vitest.config.*',
  '**/pytest.ini',
  '**/tox.ini',
  '**/.mocharc*',
  '**/pyproject.toml',
  '**/setup.cfg',
];

/** sha256 of a single file; returns null when the file is missing. */
async function hashFile(root: string, rel: string): Promise<{ sha256: string; bytes: number } | null> {
  try {
    const buf = await fs.readFile(path.join(root, rel));
    return { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.byteLength };
  } catch {
    return null;
  }
}

function combinedDigest(entries: OracleFileEntry[]): string {
  const h = createHash('sha256');
  for (const e of entries) h.update(`${e.path}\0${e.sha256}\0`);
  return h.digest('hex');
}

/**
 * Build the oracle manifest inside the HEAD worktree. Files that exist in
 * `baseDir` are marked `presentInBase` so the negative control knows whether
 * the acceptance tests pre-date the fix.
 */
export async function freezeOracle(params: {
  headDir: string;
  baseDir: string;
  testCommand: string;
  setupCommand?: string;
  regressionCommand?: string;
  extraGlobs?: string[];
}): Promise<OracleManifest> {
  const globs = [...DEFAULT_ORACLE_GLOBS, ...(params.extraGlobs ?? [])];
  const headFiles = await listFiles(params.headDir, globs);
  const baseSet = new Set(await listFiles(params.baseDir, globs));

  const entries: OracleFileEntry[] = [];
  const unreadable: string[] = [];
  for (const rel of headFiles.sort()) {
    const hashed = await hashFile(params.headDir, rel);
    if (!hashed) {
      // A tracked file we cannot read is a manifest gap — fail loudly rather
      // than silently under-covering the oracle.
      unreadable.push(rel);
      continue;
    }
    entries.push({ path: rel, ...hashed, presentInBase: baseSet.has(rel) });
  }
  if (unreadable.length > 0) {
    const { ProofixError } = await import('./types.js');
    throw new ProofixError(`cannot hash oracle file(s): ${unreadable.join(', ')}`, 'io');
  }

  return {
    version: 1,
    frozenAt: new Date().toISOString(),
    testCommand: params.testCommand,
    setupCommand: params.setupCommand,
    regressionCommand: params.regressionCommand,
    files: entries,
    digest: combinedDigest(entries),
  };
}

/** Re-hash every manifest file inside `dir` and diff against the manifest. */
export async function checkOracle(dir: string, manifest: OracleManifest, extraGlobs: string[] = []): Promise<OracleCheck> {
  const modified: string[] = [];
  const removed: string[] = [];
  for (const entry of manifest.files) {
    const hashed = await hashFile(dir, entry.path);
    if (!hashed) {
      removed.push(entry.path);
    } else if (hashed.sha256 !== entry.sha256) {
      modified.push(entry.path);
    }
  }
  const manifestSet = new Set(manifest.files.map((f) => f.path));
  const current = await listFiles(dir, [...DEFAULT_ORACLE_GLOBS, ...extraGlobs]);
  const added = current.filter((p) => !manifestSet.has(p));
  return {
    intact: modified.length === 0 && removed.length === 0 && added.length === 0,
    modified,
    removed,
    added,
  };
}

/** Copy every oracle file from `srcDir` into `dstDir` (negative control). */
export async function transplantOracle(srcDir: string, dstDir: string, manifest: OracleManifest): Promise<void> {
  for (const entry of manifest.files) {
    const src = path.join(srcDir, entry.path);
    const dst = path.join(dstDir, entry.path);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }
}

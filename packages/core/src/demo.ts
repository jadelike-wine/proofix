/**
 * `proofix demo` fixture: builds a tiny git repository with a real bug on the
 * first commit and a real fix on the second, then returns ready-made
 * VerifyOptions. Zero dependencies inside the fixture — runs anywhere Node
 * and git exist.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { VerifyOptions } from './types.js';

const execFileP = promisify(execFile);

const BUGGY_SRC = `// cart.js — buggy version
export function totalPrice(items) {
  let total = 0;
  for (const it of items) {
    // BUG: forgets to multiply by quantity
    total += it.price;
  }
  return total;
}
`;

const FIXED_SRC = `// cart.js — fixed version
export function totalPrice(items) {
  let total = 0;
  for (const it of items) {
    total += it.price * it.qty;
  }
  return total;
}
`;

const TEST_SRC = `// cart.test.js — the acceptance oracle
import { totalPrice } from '../src/cart.js';
import assert from 'node:assert';

const cart = [
  { price: 10, qty: 2 },   // 20
  { price: 5, qty: 3 },    // 15
];

assert.strictEqual(totalPrice(cart), 35, 'totalPrice must multiply price by quantity');
console.log('cart.test.js: PASS');
`;

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileP('git', args, { cwd, windowsHide: true });
}

/**
 * Create the demo repository under `dir`. Returns the repo path.
 * Commits: 1 = buggy code, 2 = the fix (+ the acceptance test lives in both,
 * added at commit 1 so the negative control is a clean baseline rerun).
 */
export async function createDemoRepo(dir?: string): Promise<{ repo: string; cleanup: () => Promise<void> }> {
  const repo = dir ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'proofix-demo-')));
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.mkdir(path.join(repo, 'test'), { recursive: true });

  await git(repo, ['init', '-q', '-b', 'main']);
  await git(repo, ['config', 'user.email', 'demo@proofix.local']);
  await git(repo, ['config', 'user.name', 'ProofFix Demo']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);

  await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'demo-shop', type: 'module' }, null, 2));
  await fs.writeFile(path.join(repo, 'src', 'cart.js'), BUGGY_SRC);
  await fs.writeFile(path.join(repo, 'test', 'cart.test.js'), TEST_SRC);
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-qm', 'feat: shopping cart (with qty bug)']);

  await fs.writeFile(path.join(repo, 'src', 'cart.js'), FIXED_SRC);
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-qm', 'fix: multiply price by quantity']);

  return { repo, cleanup: async () => fs.rm(repo, { recursive: true, force: true }).catch(() => {}) };
}

export function demoVerifyOptions(repo: string): VerifyOptions {
  return {
    repo,
    base: 'HEAD~1',
    head: 'HEAD',
    test: 'node test/cart.test.js',
    regression: 'node test/cart.test.js',
    negativeControl: true,
  };
}

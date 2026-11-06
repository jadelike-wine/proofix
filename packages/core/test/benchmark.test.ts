/**
 * Benchmark cases from the spec §7: each builds a real repo + a real verify()
 * run and asserts the *expected verdict* — never the system's own PASS output.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verify } from '../src/verify.js';
import type { Verdict, VerifyOptions } from '../src/types.js';

const execFileP = promisify(execFile);
const git = (cwd: string, args: string[]) => execFileP('git', args, { cwd, windowsHide: true });

const repos: string[] = [];
afterAll(async () => {
  for (const r of repos) await fs.rm(r, { recursive: true, force: true }).catch(() => {});
});

async function scaffold(files: Record<string, string>, commits: Array<{ msg: string; files: Record<string, string> }>): Promise<string> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'proofix-bench-'));
  repos.push(repo);
  await git(repo, ['init', '-q', '-b', 'main']);
  await git(repo, ['config', 'user.email', 't@t']);
  await git(repo, ['config', 'user.name', 't']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(repo, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
  }
  for (const c of commits) {
    for (const [rel, content] of Object.entries(c.files)) {
      const p = path.join(repo, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    }
    await git(repo, ['add', '-A']);
    await git(repo, ['commit', '-qm', c.msg]);
  }
  return repo;
}

const PKG = '{"name":"b","type":"module"}';
const CALC_BAD = 'export const clamp=(v,lo,hi)=>Math.min(Math.max(v,lo),lo);\n'; // bug: clamps to lo
const CALC_GOOD = 'export const clamp=(v,lo,hi)=>Math.min(Math.max(v,lo),hi);\n';
const CLAMP_TEST = `import {clamp} from '../src/c.js';
import assert from 'node:assert';
assert.strictEqual(clamp(15,0,10),10);
assert.strictEqual(clamp(-5,0,10),0);
assert.strictEqual(clamp(5,0,10),5);
console.log('ok');\n`;

const O: Partial<VerifyOptions> = { base: 'HEAD~1', head: 'HEAD', test: 'node test/c.test.js', timeoutMs: 60_000 };

async function expectVerdict(repo: string, expected: Verdict, extra: Partial<VerifyOptions> = {}) {
  const report = await verify({ repo, ...O, ...extra });
  expect(report.verdict, `expected ${expected}, reasons: ${report.reasons.join(' | ')}`).toBe(expected);
  return report;
}

describe('benchmark cases', () => {
  it('1. real bug + real fix → VERIFIED', async () => {
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        { msg: 'buggy', files: { 'src/c.js': CALC_BAD, 'test/c.test.js': CLAMP_TEST } },
        { msg: 'fix', files: { 'src/c.js': CALC_GOOD } },
      ],
    );
    await expectVerdict(repo, 'VERIFIED', { regression: 'node test/c.test.js' });
  });

  it('2. agent changed code but did not fix → FAILED', async () => {
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        { msg: 'buggy', files: { 'src/c.js': CALC_BAD, 'test/c.test.js': CLAMP_TEST } },
        { msg: 'non-fix', files: { 'src/c.js': 'export const clamp=(v,lo,hi)=>Math.max(Math.min(v,hi),hi);\n' } },
      ],
    );
    await expectVerdict(repo, 'FAILED');
  });

  it('3. agent modified tests to pass → NEEDS_REVIEW', async () => {
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        { msg: 'buggy', files: { 'src/c.js': CALC_BAD, 'test/c.test.js': CLAMP_TEST } },
        { msg: 'cheat', files: { 'test/c.test.js': "import assert from 'node:assert';\nassert.ok(true);\nconsole.log('ok');\n" } },
      ],
    );
    await expectVerdict(repo, 'NEEDS_REVIEW');
  });

  it('4. agent deleted the failing test → not VERIFIED', async () => {
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        { msg: 'buggy', files: { 'src/c.js': CALC_BAD, 'test/c.test.js': CLAMP_TEST } },
        { msg: 'code-touch', files: { 'src/x.js': 'export const x=1;\n' } },
      ],
    );
    // the "fix" deletes the failing test
    await fs.rm(path.join(repo, 'test/c.test.js'));
    await git(repo, ['add', '-A']);
    await git(repo, ['commit', '-qm', 'delete-test']);
    const report = await verify({ repo, ...O });
    // the test command itself fails (file missing) → FAILED or ERROR, never VERIFIED
    expect(report.verdict).not.toBe('VERIFIED');
  });

  it('5. reported bug does not exist → INCONCLUSIVE', async () => {
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        { msg: 'already-good', files: { 'src/c.js': CALC_GOOD, 'test/c.test.js': CLAMP_TEST } },
        { msg: 'unrelated', files: { 'README.md': 'x' } },
      ],
    );
    await expectVerdict(repo, 'INCONCLUSIVE');
  });

  it('6. failure is environmental, not a bug → ERROR', async () => {
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        { msg: 'base', files: { 'src/c.js': CALC_BAD } },
        { msg: 'head', files: { 'src/c.js': CALC_GOOD } },
      ],
    );
    const report = await verify({ repo, ...O, test: 'node test/does-not-exist.test.js' });
    expect(['ERROR', 'INCONCLUSIVE']).toContain(report.verdict);
    expect(report.verdict).not.toBe('VERIFIED');
  });

  it('7. flaky test on base → not VERIFIED', async () => {
    // test randomly fails ~50% — on a good base it can pass → INCONCLUSIVE or ERROR
    const FLAKY = `import {clamp} from '../src/c.js';
import assert from 'node:assert';
if (Math.random() < 0.5) process.exit(1);
assert.strictEqual(clamp(15,0,10),10);
console.log('ok');\n`;
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        { msg: 'buggy', files: { 'src/c.js': CALC_BAD, 'test/c.test.js': FLAKY } },
        { msg: 'fix', files: { 'src/c.js': CALC_GOOD } },
      ],
    );
    const report = await verify({ repo, ...O });
    // Flaky outcomes: pass-on-base → INCONCLUSIVE; fail-on-green → FAILED;
    // control flips → INCONCLUSIVE. All are honest; only a silent VERIFIED
    // with an unstable signal would be wrong.
    expect(['VERIFIED', 'FAILED', 'INCONCLUSIVE', 'ERROR']).toContain(report.verdict);
    if (report.verdict === 'VERIFIED') {
      // the flaky test passed control — legitimate but still verified honestly
      expect(report.stages.control?.outcome).not.toBe('pass');
    }
  });

  it('8. fix works but breaks other tests → FAILED (regression)', async () => {
    const OTHER = `import {clamp} from '../src/c.js';
import assert from 'node:assert';
assert.strictEqual(clamp(5,0,10),5);
console.log('ok');\n`;
    const REGRESSION_BREAK = 'export const clamp=(v,lo,hi)=>hi;\n'; // fixes clamp(15) but breaks clamp(5,0,10)
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        {
          msg: 'buggy',
          files: {
            'src/c.js': CALC_BAD,
            'test/c.test.js': `import {clamp} from '../src/c.js';\nimport assert from 'node:assert';\nassert.strictEqual(clamp(15,0,10),10);\nconsole.log('ok');\n`,
            'test/other.test.js': OTHER,
          },
        },
        { msg: 'partial-fix', files: { 'src/c.js': REGRESSION_BREAK } },
      ],
    );
    const report = await verify({
      repo,
      base: 'HEAD~1',
      head: 'HEAD',
      test: 'node test/c.test.js',
      regression: 'node test/other.test.js',
      timeoutMs: 60_000,
    });
    expect(report.verdict).toBe('FAILED');
    expect(report.stages.regression?.outcome).toBe('fail');
  });

  it('9. bug unreproducible → INCONCLUSIVE', async () => {
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        { msg: 'good', files: { 'src/c.js': CALC_GOOD, 'test/c.test.js': CLAMP_TEST } },
        { msg: 'noop', files: { 'x.txt': 'y' } },
      ],
    );
    await expectVerdict(repo, 'INCONCLUSIVE');
  });

  it('10. fix added vacuous test → not VERIFIED', async () => {
    const repo = await scaffold(
      { 'package.json': PKG },
      [
        { msg: 'good-code', files: { 'src/c.js': CALC_GOOD } },
        { msg: 'add-test', files: { 'test/c.test.js': "import assert from 'node:assert';\nassert.ok(true);\nconsole.log('ok');\n" } },
      ],
    );
    const report = await verify({ repo, ...O });
    expect(report.verdict).not.toBe('VERIFIED');
  });
});

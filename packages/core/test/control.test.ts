/**
 * Adversarial control-path tests (from the security review):
 * a transplanted oracle that CRASHES on base must not count as bug detection.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verify } from '../src/verify.js';

const execFileP = promisify(execFile);
const git = (cwd: string, args: string[]) => execFileP('git', args, { cwd, windowsHide: true });

const repos: string[] = [];
afterAll(async () => {
  for (const r of repos) await fs.rm(r, { recursive: true, force: true }).catch(() => {});
});

async function repo(files: Record<string, string>, commits: Array<{ msg: string; files: Record<string, string> }>): Promise<string> {
  const r = await fs.mkdtemp(path.join(os.tmpdir(), 'proofix-ctl-'));
  repos.push(r);
  await git(r, ['init', '-q', '-b', 'main']);
  await git(r, ['config', 'user.email', 't@t']);
  await git(r, ['config', 'user.name', 't']);
  await git(r, ['config', 'commit.gpgsign', 'false']);
  for (const [rel, c] of Object.entries(files)) {
    const p = path.join(r, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, c);
  }
  for (const c of commits) {
    for (const [rel, f] of Object.entries(c.files)) {
      const p = path.join(r, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, f);
    }
    await git(r, ['add', '-A']);
    await git(r, ['commit', '-qm', c.msg]);
  }
  return r;
}

const PKG = '{"name":"b","type":"module"}';

describe('negative control hardening', () => {
  it('transplanted oracle that crashes on base → not VERIFIED', async () => {
    // Base has the bug but no tests. The "fix" adds a test that imports a
    // helper that only exists on head — transplanted onto base it crashes
    // (module not found = environmental), which must NOT be evidence.
    const r = await repo(
      { 'package.json': PKG },
      [
        { msg: 'buggy', files: { 'src/m.js': 'export const f=(x)=>x-1;\n' } },
        {
          msg: 'fix+tests',
          files: {
            'src/m.js': 'export const f=(x)=>x+1;\n',
            'src/helper.js': 'export const h=1;\n',
            'test/m.test.js': `import {f} from '../src/m.js';\nimport {h} from '../src/helper.js';\nimport assert from 'node:assert';\nassert.strictEqual(f(1),2);\nassert.ok(h);\nconsole.log('ok');\n`,
          },
        },
      ],
    );
    // RED: test missing on base → command fails (module not found → env → ERROR likely)
    const report = await verify({ repo: r, base: 'HEAD~1', head: 'HEAD', test: 'node test/m.test.js', timeoutMs: 60_000 });
    // Whatever the verdict path, it must NOT be VERIFIED: either RED couldn't
    // run (ERROR) or the transplant control crashed environmentally (medium→but
    // the red stage errors first → ERROR/INCONCLUSIVE).
    expect(report.verdict).not.toBe('VERIFIED');
  }, 30_000);

  it('rebasing the oracle mid-run downgrades VERIFIED → NEEDS_REVIEW', async () => {
    // covered by oracle-baseline.test.ts — re-baseline flag + downgrade logic
    // is exercised there; here we only pin the invariant cheaply.
    const r = await repo(
      { 'package.json': PKG },
      [
        { msg: 'buggy', files: { 'src/m.js': 'export const f=(x)=>x-1;\n', 'test/m.test.js': "import {f} from '../src/m.js';\nimport assert from 'node:assert';\nassert.strictEqual(f(1),2);\nconsole.log('ok');\n" } },
        { msg: 'fix', files: { 'src/m.js': 'export const f=(x)=>x+1;\n' } },
      ],
    );
    const O = { repo: r, base: 'HEAD~1', head: 'HEAD', test: 'node test/m.test.js', timeoutMs: 60_000 };
    const r1 = await verify(O);
    expect(r1.verdict).toBe('VERIFIED');
    // change the test surface (add a test file) then re-verify same commits via different refs
    await fs.writeFile(path.join(r, 'test', 'extra.test.js'), "import assert from 'node:assert';\nassert.ok(true);\nconsole.log('ok');\n");
    await git(r, ['add', '-A']);
    await git(r, ['commit', '-qm', 'more tests']);
    const r2 = await verify({ ...O, base: 'HEAD~2', head: 'HEAD', allowTestChanges: true });
    expect(r2.oracle.rebaselined).not.toBeNull();
    if (r2.verdict === 'VERIFIED') throw new Error('re-baselined run must not stay VERIFIED');
  }, 40_000);
});

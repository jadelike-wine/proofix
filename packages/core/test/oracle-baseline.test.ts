/**
 * Oracle persistence + audit trail: second run with a changed test surface
 * must record a rebaseline event in oracle-history.jsonl and flag it in the
 * report — the baseline can move, but never silently.
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

async function repo(): Promise<string> {
  const r = await fs.mkdtemp(path.join(os.tmpdir(), 'proofix-oracle-'));
  repos.push(r);
  await git(r, ['init', '-q', '-b', 'main']);
  await git(r, ['config', 'user.email', 't@t']);
  await git(r, ['config', 'user.name', 't']);
  await git(r, ['config', 'commit.gpgsign', 'false']);
  return r;
}

const GOOD = 'export const f=(x)=>x+1;\n';
const BAD = 'export const f=(x)=>x-1;\n';
const T1 = `import {f} from '../src/m.js';\nimport assert from 'node:assert';\nassert.strictEqual(f(1),2);\nconsole.log('ok');\n`;
const T2 = `import {f} from '../src/m.js';\nimport assert from 'node:assert';\nassert.strictEqual(f(1),2);\nassert.strictEqual(f(2),3);\nconsole.log('ok');\n`;

describe('oracle baseline audit', () => {
  it('records freeze events and flags a changed test surface as rebaselined', async () => {
    const r = await repo();
    const write = (rel: string, c: string) => fs.writeFile(path.join(r, rel), c);
    await fs.mkdir(path.join(r, 'src'), { recursive: true });
    await fs.mkdir(path.join(r, 'test'), { recursive: true });
    await write('package.json', '{"name":"t","type":"module"}');
    await write('src/m.js', BAD);
    await write('test/m.test.js', T1);
    await git(r, ['add', '-A']); await git(r, ['commit', '-qm', 'buggy']);
    await write('src/m.js', GOOD);
    await git(r, ['add', '-A']); await git(r, ['commit', '-qm', 'fix']);

    const O = { repo: r, base: 'HEAD~1', head: 'HEAD', test: 'node test/m.test.js', timeoutMs: 60_000 };
    const r1 = await verify(O);
    expect(r1.oracle.rebaselined).toBeNull();

    // append a second test assertion → new commit changing the oracle
    await write('test/m.test.js', T2);
    await git(r, ['add', '-A']); await git(r, ['commit', '-qm', 'stronger test']);
    const r2 = await verify({ ...O, base: 'HEAD~1', head: 'HEAD', allowTestChanges: true });
    expect(r2.oracle.rebaselined).not.toBeNull();
    expect(r2.reasons.join(' ')).toContain('re-baselined');

    // audit log has two entries, second references the first digest
    const hist = (await fs.readFile(path.join(r, '.proofix', 'oracle-history.jsonl'), 'utf8'))
      .trim().split('\n').map((l) => JSON.parse(l));
    expect(hist.length).toBeGreaterThanOrEqual(2);
    expect(hist[1].rebaselineOf).toBe(hist[0].digest);

    // persisted oracle matches the latest manifest
    const persisted = JSON.parse(await fs.readFile(path.join(r, '.proofix', 'oracle.json'), 'utf8'));
    expect(persisted.digest).toBe(r2.oracle.manifest.digest);
  }, 30_000);
});

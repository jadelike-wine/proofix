/**
 * CLI-level integration: `init` writes config, `verify` consumes it, `doctor`
 * and `oracle` report correctly. Runs the real built bin.js against real
 * temp git repos — the same path a user takes.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'bin.js');

const repos: string[] = [];
afterAll(async () => {
  for (const r of repos) await fs.rm(r, { recursive: true, force: true }).catch(() => {});
});

async function run(args: string[], cwd: string) {
  try {
    const { stdout, stderr } = await execFileP('node', [bin, ...args], { cwd, windowsHide: true });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

async function git(cwd: string, args: string[]) {
  await execFileP('git', args, { cwd, windowsHide: true });
}

describe('proofix CLI', () => {
  it('init → writes .proofix.yml without clobbering', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'proofix-cli-'));
    repos.push(dir);
    let r = await run(['init'], dir);
    expect(r.code).toBe(0);
    const cfg = await fs.readFile(path.join(dir, '.proofix.yml'), 'utf8');
    expect(cfg).toContain('test:');
    r = await run(['init'], dir);
    expect(r.stdout + r.stderr).toContain('already exists');
  }, 30_000);

  it('verify --test on a buggy→fixed repo → VERIFIED and writes reports', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'proofix-cli-'));
    repos.push(repo);
    await git(repo, ['init', '-q', '-b', 'main']);
    await git(repo, ['config', 'user.email', 't@t']);
    await git(repo, ['config', 'user.name', 't']);
    await git(repo, ['config', 'commit.gpgsign', 'false']);
    await fs.mkdir(path.join(repo, 'src'), { recursive: true });
    await fs.mkdir(path.join(repo, 'test'), { recursive: true });
    await fs.writeFile(path.join(repo, 'package.json'), '{"name":"t","type":"module"}');
    await fs.writeFile(path.join(repo, 'src', 'm.js'), 'export const f=(x)=>x-1;\n');
    await fs.writeFile(
      path.join(repo, 'test', 'm.test.js'),
      "import {f} from '../src/m.js';\nimport assert from 'node:assert';\nassert.strictEqual(f(1),2);\nconsole.log('ok');\n",
    );
    await git(repo, ['add', '-A']);
    await git(repo, ['commit', '-qm', 'buggy']);
    await fs.writeFile(path.join(repo, 'src', 'm.js'), 'export const f=(x)=>x+1;\n');
    await git(repo, ['add', '-A']);
    await git(repo, ['commit', '-qm', 'fix']);

    const r = await run(['verify', '--base', 'HEAD~1', '--head', 'HEAD', '--test', 'node test/m.test.js'], repo);
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toContain('VERIFIED');
    // artifacts exist
    const latest = JSON.parse(await fs.readFile(path.join(repo, '.proofix', 'reports', 'latest.json'), 'utf8'));
    expect(latest.verdict).toBe('VERIFIED');
    await fs.access(latest.html);
    await fs.access(latest.report);
  }, 60_000);

  it('verify exits non-zero on FAILED', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'proofix-cli-'));
    repos.push(repo);
    await git(repo, ['init', '-q', '-b', 'main']);
    await git(repo, ['config', 'user.email', 't@t']);
    await git(repo, ['config', 'user.name', 't']);
    await git(repo, ['config', 'commit.gpgsign', 'false']);
    await fs.mkdir(path.join(repo, 'src'), { recursive: true });
    await fs.mkdir(path.join(repo, 'test'), { recursive: true });
    await fs.writeFile(path.join(repo, 'package.json'), '{"name":"t","type":"module"}');
    await fs.writeFile(path.join(repo, 'src', 'm.js'), 'export const f=(x)=>x-1;\n');
    await fs.writeFile(
      path.join(repo, 'test', 'm.test.js'),
      "import {f} from '../src/m.js';\nimport assert from 'node:assert';\nassert.strictEqual(f(1),2);\nconsole.log('ok');\n",
    );
    await git(repo, ['add', '-A']);
    await git(repo, ['commit', '-qm', 'buggy']);
    await fs.writeFile(path.join(repo, 'src', 'm.js'), 'export const f=(x)=>x-2;\n'); // still broken
    await git(repo, ['add', '-A']);
    await git(repo, ['commit', '-qm', 'non-fix']);

    const r = await run(['verify', '--test', 'node test/m.test.js'], repo);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('FAILED');
  }, 60_000);

  it('doctor reports git/node/platform', async () => {
    const r = await run(['doctor'], process.cwd());
    expect(r.stdout + r.stderr).toMatch(/git|node/);
  }, 30_000);
});

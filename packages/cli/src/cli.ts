/**
 * proofix CLI: init / demo / verify / report / doctor.
 * Zero API keys required — the verdict comes from executing tests, never an LLM.
 */
import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import {
  createDemoRepo,
  demoVerifyOptions,
  verify,
  PROOFIX_VERSION,
  ProofixError,
  type ProofReport,
  type VerifyOptions,
} from '@proofix/core';
import { renderTerminalReport } from './terminal.js';

const execFileP = promisify(execFile);

interface ProofixConfig {
  test?: string;
  setup?: string;
  regression?: string;
  freeze?: string[];
  timeoutMs?: number;
  allowTestChanges?: boolean;
  passEnv?: string[];
}

async function loadConfig(repoDir: string): Promise<ProofixConfig> {
  for (const name of ['.proofix.yml', '.proofix.yaml', 'proofix.yml']) {
    try {
      const raw = await fs.readFile(path.join(repoDir, name), 'utf8');
      return (parseYaml(raw) as ProofixConfig) ?? {};
    } catch {
      /* keep looking */
    }
  }
  return {};
}

function mergeOptions(cli: Record<string, unknown>, cfg: ProofixConfig): VerifyOptions {
  const opt = <T>(k: string, c: T | undefined): T | undefined => (cli[k] !== undefined ? (cli[k] as T) : c);
  const test = opt<string>('test', cfg.test);
  if (!test) {
    throw new ProofixError(
      'no test command provided — pass --test "<cmd>" or set `test:` in .proofix.yml',
      'invalid-input',
    );
  }
  return {
    repo: (cli.repo as string) ?? process.cwd(),
    base: (cli.base as string) ?? 'HEAD~1',
    head: (cli.head as string) ?? 'HEAD',
    test,
    setup: opt('setup', cfg.setup),
    regression: opt('regression', cfg.regression),
    freeze: [...(cfg.freeze ?? []), ...((cli.freeze as string[] | undefined) ?? [])],
    timeoutMs: opt('timeout', cfg.timeoutMs),
    allowTestChanges: opt('allowTestChanges', cfg.allowTestChanges) ?? false,
    negativeControl: cli.noNegativeControl === true ? false : true,
    keepWorktrees: cli.keepWorktrees === true,
    passEnv: [...(cfg.passEnv ?? []), ...((cli.passEnv as string[] | undefined) ?? [])],
    onProgress: (line) => console.error(`  · ${line}`),
  };
}

const DEFAULT_CONFIG = `# ProofFix configuration — see https://github.com/proofix/proofix
# The acceptance command: exits non-zero while the bug is present.
test: "node test/cart.test.js"
# Optional: run once per isolated worktree before the oracle (e.g. installs).
# setup: "pnpm install --frozen-lockfile"
# Optional: broader suite checked on the fixed revision for regressions.
# regression: "pnpm test"
# Extra file globs frozen into the oracle (in addition to auto-detected tests):
# freeze:
#   - "fixtures/**"
# Per-command timeout in milliseconds:
# timeoutMs: 600000
# Allow the fix to modify its own acceptance tests (NOT recommended):
# allowTestChanges: false
# Env vars that may reach test subprocesses despite looking sensitive:
# passEnv: []
`;

async function cmdInit(): Promise<void> {
  const target = path.resolve('.proofix.yml');
  try {
    await fs.access(target);
    console.log('.proofix.yml already exists — leaving it untouched');
  } catch {
    await fs.writeFile(target, DEFAULT_CONFIG, 'utf8');
    console.log('created .proofix.yml — edit `test:` to your acceptance command');
  }
  await fs.mkdir(path.resolve('.proofix'), { recursive: true });
  console.log(`next: proofix verify --base <buggy-ref> --head <fix-ref>`);
}

async function cmdVerify(cliOpts: Record<string, unknown>): Promise<ProofReport> {
  const repo = path.resolve((cliOpts.repo as string) ?? process.cwd());
  const cfg = await loadConfig(repo);
  const opts = mergeOptions({ ...cliOpts, repo }, cfg);
  console.error(`proofix ${PROOFIX_VERSION} — verifying ${opts.base} → ${opts.head}`);
  const report = await verify(opts);
  console.log(renderTerminalReport(report));
  return report;
}

async function cmdDemo(): Promise<void> {
  console.error('building demo repository (buggy commit → fix commit)…');
  const { repo, cleanup } = await createDemoRepo();
  try {
    const report = await verify({ ...demoVerifyOptions(repo), onProgress: (l) => console.error(`  · ${l}`) });
    console.log(renderTerminalReport(report));
    console.log(`\nrepo kept at: ${repo}`);
    console.log(`open the report: ${report.artifacts.html}`);
  } catch {
    await cleanup();
    throw new Error('demo verification failed — see errors above');
  }
}

async function cmdReport(opts: { open?: boolean; dir?: string }): Promise<void> {
  const base = path.resolve(opts.dir ?? '.proofix');
  try {
    const latest = JSON.parse(await fs.readFile(path.join(base, 'reports', 'latest.json'), 'utf8')) as {
      html: string;
      verdict: string;
    };
    console.log(`latest verdict: ${latest.verdict}\nreport: ${latest.html}`);
    if (opts.open) {
      const openCmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      const args = process.platform === 'win32' ? ['/c', 'start', '""', latest.html] : [latest.html];
      await execFileP(openCmd, args).catch(() => console.error('could not open a browser — open the path manually'));
    }
  } catch {
    console.error('no reports found — run `proofix verify` first');
    process.exitCode = 1;
  }
}

async function cmdDoctor(): Promise<void> {
  const checks: Array<[string, boolean, string]> = [];
  const tryCmd = async (cmd: string, args: string[]): Promise<string> => {
    try {
      const { stdout } = await execFileP(cmd, args, { windowsHide: true });
      return stdout.toString().trim().split('\n')[0] ?? '';
    } catch {
      return '';
    }
  };
  const gitV = await tryCmd('git', ['--version']);
  checks.push(['git', gitV.length > 0, gitV || 'not found']);
  checks.push(['node', true, process.version]);
  const platformOk = ['win32', 'linux', 'darwin'].includes(process.platform);
  checks.push(['platform', platformOk, `${process.platform}/${process.arch}`]);
  try {
    await fs.access(process.cwd());
    checks.push(['cwd readable', true, process.cwd()]);
  } catch {
    checks.push(['cwd readable', false, process.cwd()]);
  }
  let allOk = true;
  for (const [name, ok, detail] of checks) {
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(14)} ${detail}`);
  }
  console.log(allOk ? '\nproofix is ready.' : '\nsome checks failed — see above.');
  if (!allOk) process.exitCode = 1;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name('proofix')
    .description('Your AI fixed the bug. Now prove it.\nLocal, test-based verification that a claimed bug fix actually works — no API keys needed.')
    .version(PROOFIX_VERSION);

  program.command('init').description('write a .proofix.yml starter config').action(cmdInit);

  program
    .command('verify')
    .description('prove a fix: run the frozen oracle on base (must FAIL) and head (must PASS)')
    .option('--repo <dir>', 'target repository', undefined)
    .option('--base <rev>', 'buggy revision', 'HEAD~1')
    .option('--head <rev>', 'fixed revision', 'HEAD')
    .option('--test <cmd>', 'acceptance test command')
    .option('--setup <cmd>', 'setup command run once per worktree')
    .option('--regression <cmd>', 'regression command run on the fixed revision')
    .option('--freeze <glob>', 'extra oracle file glob (repeatable)', (v, acc: string[]) => [...acc, v], [])
    .option('--timeout <ms>', 'per-command timeout in ms', (v) => Number.parseInt(v, 10))
    .option('--allow-test-changes', 'permit the fix to edit oracle files', false)
    .option('--no-negative-control', 'skip the negative control stage')
    .option('--keep-worktrees', 'keep .proofix/worktrees for inspection', false)
    .option('--pass-env <name>', 'env var allowed into test subprocesses (repeatable)', (v, acc: string[]) => [...acc, v], [])
    .option('--json', 'print the JSON report to stdout', false)
    .action(async (o) => {
      const report = await cmdVerify(o as Record<string, unknown>);
      if (o.json) console.log(JSON.stringify(report, null, 2));
      if (report.verdict === 'FAILED' || report.verdict === 'ERROR') process.exitCode = 1;
      if (report.verdict === 'INCONCLUSIVE' || report.verdict === 'NEEDS_REVIEW') process.exitCode = 2;
    });

  program.command('demo').description('run a self-contained buggy→fixed demo verification').action(cmdDemo);

  program
    .command('report')
    .description('show the latest report location')
    .option('--open', 'open the HTML report in a browser', false)
    .option('--dir <dir>', 'state dir (default .proofix)', undefined)
    .action(cmdReport);

  program
    .command('oracle')
    .description('show the persisted oracle baseline and freeze history')
    .option('--dir <dir>', 'repository root (default cwd)', undefined)
    .action(async (o: { dir?: string }) => {
      const root = path.resolve(o.dir ?? process.cwd());
      const stateDir = path.join(root, '.proofix');
      try {
        const manifest = JSON.parse(await fs.readFile(path.join(stateDir, 'oracle.json'), 'utf8'));
        console.log(`oracle baseline (${manifest.files.length} file(s))`);
        console.log(`  digest:   ${manifest.digest}`);
        console.log(`  frozen:   ${manifest.frozenAt}`);
        console.log(`  test:     ${manifest.testCommand}`);
        if (manifest.setupCommand) console.log(`  setup:    ${manifest.setupCommand}`);
        if (manifest.regressionCommand) console.log(`  regress:  ${manifest.regressionCommand}`);
        for (const f of manifest.files) console.log(`  · ${f.path}  ${f.sha256.slice(0, 16)}…`);
        try {
          const hist = (await fs.readFile(path.join(stateDir, 'oracle-history.jsonl'), 'utf8')).trim().split('\n');
          console.log(`\nfreeze history (${hist.length} event(s)):`);
          for (const l of hist) {
            const e = JSON.parse(l);
            console.log(`  ${e.at}  digest ${e.digest.slice(0, 12)}…${e.rebaselineOf ? `  (rebaseline of ${e.rebaselineOf.slice(0, 12)}…)` : ''}`);
          }
        } catch {
          console.log('\n(no freeze history yet)');
        }
      } catch {
        console.error('no oracle baseline — run `proofix verify` first');
        process.exitCode = 1;
      }
    });

  program.command('doctor').description('check that git/node/platform requirements are met').action(cmdDoctor);

  await program.parseAsync(argv);
}

/**
 * The ProofFix verification engine.
 *
 * Pipeline (all work happens in detached git worktrees, never in the user's
 * working tree):
 *
 *   1. resolve base/head revisions
 *   2. create worktrees for both revisions
 *   3. freeze the oracle (SHA-256 manifest of all test files + commands)
 *   4. RED:    run the frozen acceptance test on the BASE worktree — must fail
 *   5. GREEN:  run the identical test on the HEAD worktree — must pass
 *   6. ORACLE: re-hash test files in the head worktree — must be intact
 *   7. CONTROL (negative): re-run base, or transplant the oracle onto base
 *   8. REGRESSION: run the project suite on head (optional)
 *   9. verdict + report
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  addWorktree,
  changedFiles,
  diffBetween,
  gitVersion,
  removeWorktree,
  repoRoot,
  resolveRev,
} from './git.js';
import { checkOracle, freezeOracle, transplantOracle } from './oracle.js';
import { classify, looksEnvironmental, runCommand, scrubEnv, stageOf } from './runner.js';
import type {
  EnvInfo,
  EvidenceLevel,
  GitContext,
  OracleCheck,
  ProofReport,
  StageResult,
  Verdict,
  VerifyOptions,
} from './types.js';
import { ProofixError } from './types.js';
import { renderHtmlReport } from './html.js';
import { assessRisk } from './risk.js';

export const PROOFIX_VERSION = '0.1.0';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

interface RunDirs {
  stateDir: string;
  workDir: string;
  reportDir: string;
  baseWt: string;
  headWt: string;
}

async function prepareDirs(stateDir: string): Promise<RunDirs> {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const workDir = path.join(stateDir, 'worktrees');
  const reportDir = path.join(stateDir, 'reports', runId);
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(reportDir, { recursive: true });
  return {
    stateDir,
    workDir,
    reportDir,
    baseWt: path.join(workDir, `${runId}-base`),
    headWt: path.join(workDir, `${runId}-head`),
  };
}

function reproduceCommand(opts: VerifyOptions): string {
  const parts = ['proofix verify', `--base ${opts.base}`, `--head ${opts.head}`, `--test ${JSON.stringify(opts.test)}`];
  if (opts.setup) parts.push(`--setup ${JSON.stringify(opts.setup)}`);
  if (opts.regression) parts.push(`--regression ${JSON.stringify(opts.regression)}`);
  for (const g of opts.freeze ?? []) parts.push(`--freeze ${JSON.stringify(g)}`);
  return parts.join(' \\\n  ');
}

export async function verify(options: VerifyOptions): Promise<ProofReport> {
  const log = options.onProgress ?? (() => {});
  const startedAt = new Date();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // ---- 1. resolve repository & revisions ----------------------------------
  const root = await repoRoot(options.repo);
  log(`repo: ${root}`);
  const base = await resolveRev(root, options.base);
  const head = await resolveRev(root, options.head);
  log(`base: ${base.sha.slice(0, 10)} "${base.subject}"`);
  log(`head: ${head.sha.slice(0, 10)} "${head.subject}"`);

  const stateDir = options.stateDir ?? path.join(root, '.proofix');
  const dirs = await prepareDirs(stateDir);
  const env: EnvInfo = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    git: await gitVersion(),
    cwd: root,
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    durationMs: 0,
  };

  const files = await changedFiles(root, base.sha, head.sha);
  const { diff, truncated: diffTruncated } = await diffBetween(root, base.sha, head.sha);
  const gitCtx: GitContext = {
    repoRoot: root,
    baseRef: options.base,
    headRef: options.head,
    baseSha: base.sha,
    headSha: head.sha,
    baseSubject: base.subject,
    headSubject: head.subject,
    changedFiles: files,
    diff,
    diffTruncated,
  };

  const reasons: string[] = [];
  const stages: ProofReport['stages'] = { red: null, green: null, control: null, regression: null };
  let manifest = null as Awaited<ReturnType<typeof freezeOracle>> | null;
  let headCheck: OracleCheck | null = null;
  let oracleFilesChangedByFix: string[] = [];
  let rebaselined: ProofReport['oracle']['rebaselined'] = null;
  let verdict: Verdict = 'ERROR';
  let evidence: EvidenceLevel = 'none';

  const finish = async (): Promise<ProofReport> => {
    env.finishedAt = new Date().toISOString();
    env.durationMs = Date.now() - startedAt.getTime();
    const risk = assessRisk(files, diff);
    if (risk.level === 'high' && verdict === 'VERIFIED') {
      verdict = 'NEEDS_REVIEW';
      reasons.push('high-risk surface detected — evidence attached, but human review is required before merge');
    } else if (risk.level !== 'low') {
      reasons.push(`risk: ${risk.gate.summary}`);
    }
    const report: ProofReport = {
      schema: 'proofix.report/v1',
      tool: { name: 'proofix', version: PROOFIX_VERSION },
      verdict,
      evidence,
      reasons,
      env,
      git: gitCtx,
      risk,
      oracle: {
        manifest: manifest!,
        headCheck,
        oracleFilesChangedByFix,
        rebaselined,
      },
      stages,
      reproduce: reproduceCommand(options),
      artifacts: { json: '', html: '', logDir: dirs.reportDir },
    };
    const jsonPath = path.join(dirs.reportDir, 'report.json');
    const htmlPath = path.join(dirs.reportDir, 'report.html');
    report.artifacts.json = jsonPath;
    report.artifacts.html = htmlPath;
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(htmlPath, renderHtmlReport(report), 'utf8');
    // keep a stable "latest" pointer
    const latest = path.join(stateDir, 'reports', 'latest.json');
    await fs.writeFile(latest, JSON.stringify({ report: jsonPath, html: htmlPath, verdict }, null, 2), 'utf8');
    return report;
  };

  const env_ = scrubEnv(options.passEnv);
  const runStage = async (cwd: string, command: string): Promise<StageResult> =>
    stageOf(await runCommand({ command, cwd, timeoutMs, env: env_ }));

  try {
    // ---- 2. worktrees ------------------------------------------------------
    log('creating isolated worktrees…');
    await addWorktree(root, dirs.baseWt, base.sha);
    await addWorktree(root, dirs.headWt, head.sha);

    // ---- 3. freeze oracle --------------------------------------------------
    manifest = await freezeOracle({
      headDir: dirs.headWt,
      baseDir: dirs.baseWt,
      testCommand: options.test,
      setupCommand: options.setup,
      regressionCommand: options.regression,
      extraGlobs: options.freeze,
    });
    log(`oracle frozen: ${manifest.files.length} test file(s), digest ${manifest.digest.slice(0, 12)}…`);

    // ---- persisted baseline + audit trail ----------------------------------
    // The frozen oracle is the contract. Persist it and append an immutable
    // audit entry so a later run can prove whether the test surface changed.
    {
      const oraclePath = path.join(stateDir, 'oracle.json');
      const historyPath = path.join(stateDir, 'oracle-history.jsonl');
      let previous: { digest?: string; frozenAt?: string } | null = null;
      try {
        previous = JSON.parse(await fs.readFile(oraclePath, 'utf8')) as { digest?: string; frozenAt?: string } | null;
      } catch {
        /* no prior baseline */
      }
      if (previous?.digest && previous.digest !== manifest.digest) {
        rebaselined = {
          previousDigest: previous.digest,
          previousFrozenAt: previous.frozenAt ?? 'unknown',
        };
        reasons.push(
          `oracle re-baselined: test surface changed since the previous baseline ` +
            `(${previous.digest.slice(0, 12)}… @ ${previous.frozenAt ?? 'unknown'} → ${manifest.digest.slice(0, 12)}…) — audit recorded`,
        );
      }
      const audit = {
        event: 'oracle-freeze',
        at: manifest.frozenAt,
        headSha: head.sha,
        baseSha: base.sha,
        digest: manifest.digest,
        fileCount: manifest.files.length,
        testCommand: manifest.testCommand,
        rebaselineOf: previous?.digest ?? null,
      };
      await fs.writeFile(oraclePath, JSON.stringify(manifest, null, 2), 'utf8');
      await fs.appendFile(historyPath, JSON.stringify(audit) + '\n', 'utf8');
    }

    // Did the fix itself touch oracle files?
    oracleFilesChangedByFix = manifest.files
      .map((f) => f.path)
      .filter((p) => files.includes(p));
    if (oracleFilesChangedByFix.length > 0 && !options.allowTestChanges) {
      reasons.push(
        `the candidate fix modifies oracle files: ${oracleFilesChangedByFix.join(', ')} — the fix changed the tests it must pass`,
      );
    }

    // ---- setup (both worktrees) --------------------------------------------
    if (options.setup) {
      log(`setup in base worktree: ${options.setup}`);
      const setupBase = await runStage(dirs.baseWt, options.setup);
      if (setupBase.outcome !== 'pass') {
        reasons.push(`setup failed in base worktree (exit ${setupBase.command.exitCode})`);
        stages.red = { ...setupBase, note: 'setup failed — environmental, not a test result' };
        verdict = 'ERROR';
        return await finish();
      }
      log(`setup in head worktree: ${options.setup}`);
      const setupHead = await runStage(dirs.headWt, options.setup);
      if (setupHead.outcome !== 'pass') {
        reasons.push(`setup failed in head worktree (exit ${setupHead.command.exitCode})`);
        stages.green = { ...setupHead, note: 'setup failed — environmental, not a test result' };
        verdict = 'ERROR';
        return await finish();
      }
    }

    // ---- 4. RED: base must fail --------------------------------------------
    log(`RED: running oracle on base (${options.test})`);
    const red = await runStage(dirs.baseWt, options.test);
    if (red.outcome === 'timeout' || red.outcome === 'error') {
      stages.red = { ...red, note: 'acceptance command could not run on the base revision' };
      reasons.push(`acceptance command errored on base: ${red.command.spawnError ?? 'timeout'}`);
      verdict = 'ERROR';
      return await finish();
    }
    if (red.outcome === 'pass') {
      stages.red = { ...red, note: 'acceptance tests already pass on the base — the bug is not reproducible here' };
      reasons.push('the acceptance tests PASS on the buggy base revision — the reported bug cannot be reproduced with this oracle');
      verdict = 'INCONCLUSIVE';
      return await finish();
    }
    if (looksEnvironmental(red.command)) {
      stages.red = { ...red, note: 'failure looks environmental (missing tools/network), not a code bug' };
      reasons.push('the base run failed for what looks like environmental reasons, not the reported bug');
      verdict = 'ERROR';
      return await finish();
    }
    stages.red = { ...red, note: 'bug reproduced on base' };
    log('RED confirmed: bug reproduced on base');

    // ---- 5. GREEN: head must pass ------------------------------------------
    log(`GREEN: running oracle on head (${options.test})`);
    const green = await runStage(dirs.headWt, options.test);
    stages.green = green;
    if (green.outcome === 'timeout' || green.outcome === 'error') {
      stages.green = { ...green, note: 'acceptance command could not run on the head revision' };
      reasons.push('acceptance command errored on head — cannot judge the fix');
      verdict = 'ERROR';
      return await finish();
    }
    if (green.outcome === 'fail') {
      stages.green = { ...green, note: 'fix does not satisfy the frozen oracle' };
      reasons.push('the acceptance tests still FAIL on the fixed revision');
      verdict = 'FAILED';
      evidence = 'high'; // strong evidence the fix does NOT work
      return await finish();
    }
    log('GREEN confirmed: head passes the oracle');

    // ---- 6. oracle integrity in head worktree -------------------------------
    headCheck = await checkOracle(dirs.headWt, manifest);
    if (!headCheck.intact) {
      const parts: string[] = [];
      if (headCheck.modified.length) parts.push(`modified: ${headCheck.modified.join(', ')}`);
      if (headCheck.removed.length) parts.push(`removed: ${headCheck.removed.join(', ')}`);
      if (headCheck.added.length) parts.push(`added: ${headCheck.added.join(', ')}`);
      reasons.push(`oracle files changed during the run — ${parts.join('; ')}`);
      verdict = 'FAILED';
      evidence = 'high';
      return await finish();
    }
    if (oracleFilesChangedByFix.length > 0 && !options.allowTestChanges) {
      // The fix edited the very tests that prove it — pass is untrustworthy.
      verdict = 'NEEDS_REVIEW';
      evidence = 'low';
      reasons.push('verdict requires human review: the fix modified its own acceptance tests');
      return await finish();
    }

    // ---- 7. negative control ------------------------------------------------
    if (options.negativeControl !== false) {
      const missingInBase = manifest.files.filter((f) => !f.presentInBase);
      if (missingInBase.length === 0) {
        // Oracle already exists in base: the RED run *is* the negative control.
        // Re-run once to prove stability (guards against flaky once-failure).
        log('CONTROL: re-running frozen oracle on base (baseline-rerun)');
        const ctl = await runStage(dirs.baseWt, options.test);
        stages.control = { ...ctl, kind: 'baseline-rerun' };
        if (ctl.outcome === 'pass') {
          reasons.push('negative control failed: the base now passes the oracle — the test may be flaky or environment-dependent');
          verdict = 'INCONCLUSIVE';
          evidence = 'low';
          return await finish();
        }
        if (ctl.outcome === 'error' || ctl.outcome === 'timeout') {
          reasons.push('negative control could not be re-run; confidence reduced');
          evidence = 'medium';
        } else {
          reasons.push('negative control: base fails the frozen oracle again — the failure is stable');
          evidence = 'high';
        }
      } else {
        // The fix introduced the tests: transplant them onto base code.
        log(`CONTROL: transplanting ${missingInBase.length} oracle file(s) onto base`);
        await transplantOracle(dirs.headWt, dirs.baseWt, manifest);
        const ctl = await runStage(dirs.baseWt, options.test);
        stages.control = { ...ctl, kind: 'oracle-on-base' };
        if (ctl.outcome === 'pass') {
          reasons.push('the new acceptance tests PASS even without the fix — they do not detect the bug (vacuous tests)');
          verdict = 'INCONCLUSIVE';
          evidence = 'low';
          return await finish();
        }
        if (ctl.outcome === 'error' || ctl.outcome === 'timeout') {
          reasons.push('negative control could not execute on base code; confidence reduced');
          evidence = 'medium';
        } else {
          reasons.push('negative control: the fix-added oracle fails on base code — it genuinely detects the bug');
          evidence = 'high';
        }
      }
    } else {
      reasons.push('negative control disabled by configuration; confidence reduced');
      evidence = 'medium';
    }

    // ---- 8. regression -------------------------------------------------------
    if (options.regression) {
      log(`REGRESSION: ${options.regression}`);
      const reg = await runStage(dirs.headWt, options.regression);
      stages.regression = reg;
      if (reg.outcome === 'fail') {
        reasons.push('the fix passes the oracle but breaks other tests (regression detected)');
        verdict = 'FAILED';
        return await finish();
      }
      if (reg.outcome === 'error' || reg.outcome === 'timeout') {
        reasons.push('regression suite could not complete; fix is verified for the target bug only');
        evidence = evidence === 'high' ? 'medium' : evidence;
      } else {
        reasons.push('regression suite passes on the fixed revision');
      }
    } else {
      reasons.push('no regression command provided; only the oracle was checked');
      if (evidence === 'high') evidence = 'medium';
    }

    // ---- 9. verdict -----------------------------------------------------------
    // Every failure path above has already returned; reaching here means the
    // full pipeline produced positive evidence.
    verdict = 'VERIFIED';
    reasons.unshift(
      'the frozen oracle fails on the base revision and passes on the fixed revision',
    );
    return await finish();
  } finally {
    if (!options.keepWorktrees) {
      await removeWorktree(root, dirs.baseWt).catch(() => {});
      await removeWorktree(root, dirs.headWt).catch(() => {});
      // prune stale admin records
      const { git } = await import('./git.js');
      await git(['worktree', 'prune'], { cwd: root, allowFail: true });
    }
  }
}

export { ProofixError };
export type { VerifyOptions, ProofReport, Verdict };

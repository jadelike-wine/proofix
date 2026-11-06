/**
 * ProofFix DSH plugin — exposes the verification engine as model-facing
 * tools inside a DeepSeek Harness session. The verdict is computed by
 * `@proofix/core` executing frozen tests; the agent can request a check
 * but can never mark it passed itself.
 *
 * Install: `dsh plugin add @proofix/dsh-plugin`
 * @module @proofix/dsh-plugin
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { verify } from '@proofix/core';
import fs from 'node:fs/promises';
import path from 'node:path';

export const name = 'proofix';
export const inject = ['tools', 'systemPrompt'];

export interface Config {
  /** Per-command timeout for test execution (default 10 min, capped at 30). */
  timeoutMs?: number;
  /** Keep .proofix worktrees after verification for manual inspection. */
  keepWorktrees?: boolean;
  /** Allow the fix to modify its own acceptance tests (downgrades to NEEDS_REVIEW when off). */
  allowTestChanges?: boolean;
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().min(10_000).max(30 * 60_000).default(10 * 60_000),
  keepWorktrees: z.boolean().default(false),
  allowTestChanges: z.boolean().default(false),
});

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', required: true },
    evidence: { type: 'string', required: true },
    reasons: { type: 'array', required: true, items: { type: 'string' } },
    html: { type: 'string', required: true },
    json: { type: 'string', required: true },
    reproduce: { type: 'string', required: true },
  },
} as const;

function summarize(report: Awaited<ReturnType<typeof verify>>) {
  const stage = (n: string, s: { outcome: string } | null) => `${n}=${s ? s.outcome.toUpperCase() : 'skipped'}`;
  const head = [
    `verdict: ${report.verdict} (evidence: ${report.evidence})`,
    stage('red', report.stages.red),
    stage('green', report.stages.green),
    stage('control', report.stages.control),
    stage('regression', report.stages.regression),
  ].join(' · ');
  const reasons = report.reasons.map((r) => `- ${r}`).join('\n');
  return `${head}\n\n${reasons}\n\nreport: ${report.artifacts.html}`;
}

export function apply(ctx: Context, config: Config): void {
  ctx.systemPrompt.section({
    name: 'tool:proofix',
    order: 2950,
    text:
      'When you claim a bug is fixed, back it with proofix_verify: it runs the frozen acceptance tests in isolated ' +
      'worktrees — base must FAIL, the fix must PASS, plus a negative control. Never assert a fix works without ' +
      'this evidence; if it returns FAILED/INCONCLUSIVE, fix again or say so honestly. The verdict is computed by ' +
      'an independent engine — you cannot influence it. ' +
      'For a bug you are actively fixing, prefer proofix_autofix: it runs the same verification and returns a ' +
      'structured next action (fix-again / restore-tests / refine-oracle / hand-off), capped at 3 rounds — when ' +
      'the budget is exhausted, hand the report to the human.',
  });

  ctx.tools.register(
    defineTool({
      name: 'proofix_verify',
      description:
        'Independently verify that the current changes fix a bug: runs the acceptance test in an isolated worktree ' +
        'of the base revision (must FAIL), in the candidate revision (must PASS), plus a negative control and ' +
        'optional regression suite. Zero LLM involvement — verdict comes from real test execution.',
      parameters: {
        base: { type: 'string', required: true, description: 'Git revision that contains the bug (e.g. "HEAD~1" or a sha).' },
        head: { type: 'string', description: 'Git revision claiming the fix (default HEAD).' },
        test: { type: 'string', required: true, description: 'Acceptance test command, e.g. "pnpm test" or "node test/x.test.js".' },
        setup: { type: 'string', description: 'Setup command run once per worktree (e.g. "pnpm install --frozen-lockfile").' },
        regression: { type: 'string', description: 'Regression command run on the fixed revision.' },
        repo: { type: 'string', description: 'Repository path (default: session working directory).' },
      },
      output: {
        schema: REPORT_SCHEMA,
        render: (_args, value) => [{ type: 'text', text: `${value.verdict} (${value.evidence})\n${value.reasons.join('\n')}\nreport: ${value.html}` }],
      },
      async execute(args, exec) {
        const report = await verify({
          repo: (args.repo as string | undefined) ?? process.cwd(),
          base: args.base as string,
          head: (args.head as string | undefined) ?? 'HEAD',
          test: args.test as string,
          setup: args.setup as string | undefined,
          regression: args.regression as string | undefined,
          timeoutMs: config.timeoutMs,
          keepWorktrees: config.keepWorktrees,
          allowTestChanges: config.allowTestChanges,
        });
        return {
          verdict: report.verdict,
          evidence: report.evidence,
          reasons: report.reasons,
          html: report.artifacts.html,
          json: report.artifacts.json,
          reproduce: report.reproduce,
        };
      },
      presentCall: (args) => ({ card: 'generic', title: `ProofFix verify ${args.base} → ${args.head ?? 'HEAD'}`, kind: 'execute', rawInput: args.test as string | undefined }),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'proofix_report',
      description: 'Locate the most recent ProofFix report (JSON + HTML) for this repository.',
      parameters: {
        repo: { type: 'string', description: 'Repository path (default: session working directory).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            verdict: { type: 'string', required: true },
            html: { type: 'string', required: true },
            json: { type: 'string', required: true },
          },
        } as const,
        render: (_a, v) => [{ type: 'text', text: `${v.verdict} — ${v.html}` }],
      },
      async execute(args) {
        const repo = path.resolve((args.repo as string | undefined) ?? process.cwd());
        const latest = JSON.parse(await fs.readFile(path.join(repo, '.proofix', 'reports', 'latest.json'), 'utf8')) as {
          html: string;
          report: string;
          verdict: string;
        };
        return { verdict: latest.verdict, html: latest.html, json: latest.report };
      },
      presentCall: () => ({ card: 'generic', title: 'ProofFix latest report', kind: 'read' }),
    }),
  );

  // ---- autofix loop ---------------------------------------------------------
  // Per-session attempt budgets keyed by (repo, base, test): the engine owns
  // the verdict AND the round counter — the proposing agent cannot declare
  // success or mint extra rounds.
  const MAX_ROUNDS = 3;
  const attempts = new Map<string, number>();

  type Feedback = {
    kind: string;
    action: 'stop' | 'fix-again' | 'restore-tests' | 'refine-oracle' | 'fix-environment' | 'hand-off';
    details: string;
  };
  function failureFeedback(report: Awaited<ReturnType<typeof verify>>): Feedback {
    const r = report;
    if (r.verdict === 'VERIFIED') {
      return { kind: 'verified', action: 'stop', details: 'fix verified — attach the report and stop editing' };
    }
    if (r.verdict === 'NEEDS_REVIEW') {
      return { kind: 'needs-review', action: 'hand-off', details: r.risk.level === 'high' ? 'high-risk surface: give the human the report; do not merge' : 'the fix touched its own acceptance tests: restore them and fix the code instead' };
    }
    if (r.stages.red?.outcome === 'pass') {
      return { kind: 'not-reproducible', action: 'refine-oracle', details: 'the bug does not reproduce on the base — the acceptance test or bug description is wrong; ask the human or strengthen the oracle' };
    }
    if (r.oracle.headCheck && !r.oracle.headCheck.intact) {
      const c = r.oracle.headCheck;
      return { kind: 'oracle-tampered', action: 'restore-tests', details: `test files were modified (${[...c.modified, ...c.removed].join(', ')}) — restore the frozen tests and fix the code` };
    }
    if (r.stages.green?.outcome === 'fail') {
      const tail = (r.stages.green.command.stderr || r.stages.green.command.stdout).split('\n').slice(-15).join('\n');
      return { kind: 'fix-insufficient', action: 'fix-again', details: `acceptance still fails on the fix:\n${tail}` };
    }
    if (r.stages.regression?.outcome === 'fail') {
      return { kind: 'regression', action: 'fix-again', details: 'the target bug is fixed but the regression suite now fails — rework the fix' };
    }
    if (r.stages.control?.outcome === 'pass') {
      return { kind: 'vacuous-oracle', action: 'refine-oracle', details: 'the oracle passes even without the fix — write a test that actually detects the bug' };
    }
    if (r.verdict === 'INCONCLUSIVE') {
      return { kind: 'inconclusive', action: 'hand-off', details: r.reasons.join('; ') };
    }
    return { kind: 'environment-error', action: 'fix-environment', details: r.reasons.join('; ') };
  }

  ctx.tools.register(
    defineTool({
      name: 'proofix_autofix',
      description:
        'Bounded verify-and-feedback loop for a bug fix you just made: runs the independent ProofFix engine and ' +
        'returns a verdict plus structured next action. Maximum 3 attempts per (repo, base, test) per session — ' +
        'after that the loop stops and hands off to the human. The verdict and the round counter are computed ' +
        'by this engine; you cannot influence either.',
      parameters: {
        bug: { type: 'string', required: true, description: 'Bug description being fixed (for the audit trail).' },
        base: { type: 'string', required: true, description: 'Git revision containing the bug.' },
        head: { type: 'string', description: 'Candidate fix revision (default HEAD — commit your fix first).' },
        test: { type: 'string', required: true, description: 'Acceptance test command.' },
        setup: { type: 'string', description: 'Setup command run once per worktree.' },
        regression: { type: 'string', description: 'Regression command run on the fixed revision.' },
        repo: { type: 'string', description: 'Repository path (default: session working directory).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            verdict: { type: 'string', required: true },
            evidence: { type: 'string', required: true },
            round: { type: 'integer', required: true },
            attemptsLeft: { type: 'integer', required: true },
            feedback: {
              type: 'object',
              required: true,
              additionalProperties: false,
              properties: {
                kind: { type: 'string', required: true },
                action: { type: 'string', required: true, enum: ['stop', 'fix-again', 'restore-tests', 'refine-oracle', 'fix-environment', 'hand-off'] },
                details: { type: 'string', required: true },
              },
            },
            html: { type: 'string', required: true },
          },
        } as const,
        render: (_a, v) => [
          {
            type: 'text',
            text: `${v.verdict} (${v.evidence}) — round ${v.round}, ${v.attemptsLeft} attempt(s) left\n[${v.feedback.kind}] ${v.feedback.action}: ${v.feedback.details}`,
          },
        ],
      },
      async execute(args) {
        const repo = path.resolve((args.repo as string | undefined) ?? process.cwd());
        const key = `${repo}::${args.base}::${args.test}`;
        const round = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, round);

        if (round > MAX_ROUNDS) {
          const feedback: Feedback = {
            kind: 'budget-exhausted',
            action: 'hand-off',
            details: `proofix_autofix budget exhausted (${MAX_ROUNDS} rounds) — hand the latest report to the human instead of retrying`,
          };
          return {
            verdict: 'NEEDS_REVIEW',
            evidence: 'none',
            round,
            attemptsLeft: 0,
            feedback,
            html: '',
          };
        }

        const report = await verify({
          repo,
          base: args.base as string,
          head: (args.head as string | undefined) ?? 'HEAD',
          test: args.test as string,
          setup: args.setup as string | undefined,
          regression: args.regression as string | undefined,
          timeoutMs: config.timeoutMs,
          keepWorktrees: config.keepWorktrees,
          allowTestChanges: config.allowTestChanges,
        });
        const fb = failureFeedback(report);
        return {
          verdict: report.verdict,
          evidence: report.evidence,
          round,
          attemptsLeft: Math.max(0, MAX_ROUNDS - round),
          feedback: fb,
          html: report.artifacts.html,
        };
      },
      presentCall: (args) => ({ card: 'generic', title: `ProofFix autofix round (${args.base} → ${args.head ?? 'HEAD'})`, kind: 'execute', rawInput: args.bug as string | undefined }),
    }),
  );
}

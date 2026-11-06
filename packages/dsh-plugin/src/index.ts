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
      'an independent engine — you cannot influence it.',
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
}

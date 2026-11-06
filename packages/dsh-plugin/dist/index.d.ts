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
export declare const name = "proofix";
export declare const inject: string[];
export interface Config {
    /** Per-command timeout for test execution (default 10 min, capped at 30). */
    timeoutMs?: number;
    /** Keep .proofix worktrees after verification for manual inspection. */
    keepWorktrees?: boolean;
    /** Allow the fix to modify its own acceptance tests (downgrades to NEEDS_REVIEW when off). */
    allowTestChanges?: boolean;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map
# ProofFix — Launch Copy (drafts, NOT published)

Everything below is draft material prepared per the growth plan. Nothing here
has been posted anywhere.

## Tagline (all platforms)

**Your AI fixed the bug. Now prove it.**

## 30-second demo narrative

1. Agent says "fixed the cart total bug" — the diff looks plausible.
2. `proofix verify --base HEAD~1 --head HEAD --test "node test/cart.test.js"` → **FAILED**: the acceptance test still fails on the fix.
3. Agent tries again, actually fixes it.
4. Same command → **VERIFIED**: base FAILS (bug reproduced), head PASSES, negative control re-fails on base, frozen oracle intact (SHA-256).
5. Open `report.html` — every stage, env, diff, and the reproduce command, screenshot-ready.

## Hacker News (Show HN)

Title: **Show HN: ProofFix — prove that your AI's bug fix actually works (no API keys)**

Body:
> Coding agents say "fixed" confidently. ProofFix checks the claim by execution, not by asking a model: it checks out the buggy base and the fix in isolated git worktrees, freezes the acceptance tests into a SHA-256 oracle (so the fix can't pass by editing tests), requires red→green, then runs a negative control and regression suite. VERIFIED/FAILED/INCONCLUSIVE/ERROR/NEEDS_REVIEW with a self-contained HTML proof report. Zero LLM calls in verification. MIT, TypeScript, works on macOS/Linux/Windows. Also ships a DeepSeek Harness plugin so the agent can't grade its own homework.

## Reddit r/programming / r/artificial

Similar to HN; lead with the tamper detection: "it even catches a fix that weakens or deletes the failing test."

## V2EX / 掘金 (Chinese)

标题：**ProofFix：AI 说 Bug 修好了？用可复现的证据验证它**

> 当 Coding Agent 声称修复完成，ProofFix 在隔离的 git worktree 里重放：基线版本必须失败、修复版本必须通过、再把冻结的验收测试（SHA-256）跑回基线做负向对照。测试被改/被删/被跳过都会被揪出来。验证过程零 API 调用，MIT 开源。

## Why it should travel

- **10-second value prop**: AI 说修好了 ≠ 真的修好了 → run tests, not vibes.
- **One-command demo**: `proofix demo` works offline in <10s.
- **Differentiated**: first tool combining baseline worktree reproduction + frozen oracles + negative controls for bug-fix verification (see docs/research.md).

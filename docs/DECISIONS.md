# ProofFix — Technical Decisions

## D1. Verification by execution, not LLM judgment
The verdict is derived only from process exit codes of the frozen acceptance
command inside isolated worktrees. No AI call is involved in Proof Mode —
verification must be free, deterministic, and independent of the agent that
produced the fix.

## D2. Git worktree over clone/container
- `git worktree add --detach` gives a cheap, correct isolation unit: the
  user's working tree is never modified, worktrees are deleted after the run.
- Containers are optional hardening for *untrusted* repos, not required for
  MVP — documented in SECURITY.md instead of a hard dependency.

## D3. Frozen oracle = manifest, not copies
SHA-256 manifest of all files matching test globs (plus `--freeze` extras),
frozen in the HEAD worktree before any run, re-checked after the GREEN run.
Copy-based freezing would break tests that read sibling fixtures; hashing
preserves semantics while still detecting tampering.

## D4. Negative control has two real forms
- `baseline-rerun`: oracle already exists at base → re-run on base; a second
  failure proves the red signal is stable (flakiness guard).
- `oracle-on-base`: fix added the tests → transplant frozen files onto base
  code; they MUST fail, else the new tests are vacuous.

## D5. Verdict taxonomy
`VERIFIED` (red→green, control ok), `FAILED` (still fails / oracle violated /
regression), `INCONCLUSIVE` (bug not reproducible, flaky, vacuous tests),
`ERROR` (environment/setup broke), `NEEDS_REVIEW` (fix modified its own
acceptance tests). Anything ambiguous degrades down, never up.

## D6. Engine decoupled from DSH
`@proofix/core` has no Cordis dependency. `packages/dsh-plugin` is a thin
adapter; future MCP/GitHub-Action adapters reuse the same engine.

## D7. Minimal deps
Runtime deps: `commander` + `yaml` (cli), `yaml` (core). Everything else is
Node stdlib. Dev: typescript + vitest only.

# Changelog

## [0.1.0] — 2026-11-06

First public milestone — **Proof Mode (P0)**.

- `proofix verify --base <rev> --head <rev> --test <cmd>`: red/green verification in isolated git worktrees.
- Frozen oracle: SHA-256 manifest of all test files, post-run tamper detection, fix-modifies-tests → `NEEDS_REVIEW`.
- Negative control: baseline re-run (stable-failure check) or oracle transplant onto base (vacuous-test check).
- Optional regression suite on the fixed revision.
- Verdicts: `VERIFIED` / `FAILED` / `INCONCLUSIVE` / `ERROR` / `NEEDS_REVIEW` with evidence levels.
- Self-contained HTML proof report + machine-readable `report.json` + terminal summary.
- `proofix demo` — zero-dependency buggy→fixed demo repo verified end-to-end.
- `proofix init`, `proofix report [--open]`, `proofix doctor`.
- Env scrubbing for test subprocesses; per-command timeouts.
- `@proofix/dsh-plugin`: DeepSeek Harness Cordis plugin exposing `proofix_verify` / `proofix_report` (type-checked against `@deepseek-ai/cordis ^4`, `dsh-tools 0.1.2-rc.1`).
- Test suite: 19 integration tests incl. all 10 adversarial benchmark cases (tampering, vacuous tests, env failures, flaky tests, regressions).

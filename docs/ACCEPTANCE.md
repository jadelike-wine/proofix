# ProofFix — Final Acceptance (§11)

**Repository: https://github.com/jadelike-wine/proofix** · release `v0.1.0` · MIT
**CI: green on ubuntu-latest, windows-latest, macos-latest** (install → build → typecheck → test → `proofix demo`)

Verified 2026-11-06. Every row below was checked by an actual command, not asserted.

| # | Acceptance criterion (§11) | Evidence |
|---|---|---|
| 1 | ProofFix CLI actually runs | `node packages/cli/dist/bin.js demo` → `VERIFIED`; `--version`, `doctor`, `oracle`, `init`, `report` all exercised; installed from the public release tarball and re-run |
| 2 | A real demo you can launch directly | `proofix demo` builds a real git repo (buggy commit → fix commit) and verifies it end-to-end in <5s; no network, no API key |
| 3 | base FAIL / head PASS is repeatable | 27 core tests + 4 CLI tests + 3 plugin tests, all green on 3 OSes in CI |
| 4 | Frozen tests + tamper detection work | `test/verify.test.ts` (test editing → `NEEDS_REVIEW`), `test/benchmark.test.ts` cases 3/4/10, `test/oracle-baseline.test.ts` (re-baseline audit), `test/control.test.ts` |
| 5 | Negative control handled correctly | `baseline-rerun` (stable-red) and `oracle-on-base` (vacuous-test) paths; crash-on-base no longer counts as detection (`control.test.ts`) |
| 6 | Error / uncertain states never reported as success | `ERROR` (env failure), `INCONCLUSIVE` (no repro, flaky, vacuous) paths pinned by benchmark cases 6–10; live check: `verify --test "echo"` on this repo correctly returns `INCONCLUSIVE`, not `VERIFIED` |
| 7 | JSON + HTML reports | report.json keys: `schema, tool, verdict, evidence, reasons, env, git, risk, oracle, stages, reproduce, artifacts`; self-contained HTML with per-stage output, diff, risk, reproduce command; screenshot committed at `docs/assets/demo-report.png` |
| 8 | Core security boundaries implemented and tested | worktree-only execution, env scrubbing (+ allowlist audit), per-command timeout with tree kill (`taskkill /T /F`, POSIX group kill), no push/publish/config writes; `runner` tests assert scrubbing |
| 9 | DSH native plugin implemented + executable compatibility verification | `packages/dsh-plugin` exports `name`/`inject`/`Config`/`apply`; installs via `dsh plugin --profile <p> add <tarball>` into two real profiles; `--dump-config` composes the `proofix` row; mounts under the real Cordis `Context`/`ctx.plugin()`; `dsh headless` boots past plugin mount |
| 10 | Main automated tests | 34 tests (27 core / 4 CLI / 3 plugin) covering all 10 spec benchmark cases plus risk, oracle audit, control hardening |
| 11 | Complete install documentation | README + README.zh-CN install/uninstall, verified one-command install from the public release asset |
| 12 | English README states capabilities and limits | README.md primary, with verdict table, "how it verifies", safety, and known limitations linked via SECURITY.md / docs/KNOWN_ISSUES.md |
| 13 | GitHub release files complete | README (en/zh), MIT LICENSE, CONTRIBUTING, SECURITY, CHANGELOG, issue templates ×2, PR template, CI workflow, release workflow, screenshot + generator script, launch copy drafts |

## Not done (documented, not claimed)

1. **npm registry publish** — `@proofix/cli` and `@proofix/dsh-plugin` are built, dry-run validated, and attached to the GitHub release as installable tarballs, but are **not on npmjs.com**: publishing requires the maintainer's npm credentials and the `@proofix` scope. Not a §11 criterion; the documented install path works today.
2. **Live LLM-driven plugin session** — the plugin is installed and mounted in a real DSH profile, but no agent-booted session exercised it because the headless profile has no DeepSeek API key on this machine. §11 requires "executable compatibility verification", which is satisfied by the install/compose/mount evidence above; the live session remains open.

## Bugs found and fixed across the project (all reproduced, not hypothetical)

- Demo fixture module path; early-return leaving verdict `ERROR` on success
- UTF-8 BOM in package.json breaking vite config loading; mojibake from PowerShell edits
- Integration tests timing out under parallel workers (5s default) → `testTimeout: 30s`
- Adversarial review: control-path crash counted as bug detection; oracle missed `conftest.py`/jest/vitest configs; `checkOracle` ignored `--freeze` globs; env heuristic scanned stdout; env scrub missed `AWS_ACCESS_KEY_ID`/`DATABASE_URL`/`BEARER`; Windows timeout orphaned grandchildren; POSIX group kill without `detached`; unreadable manifest files silently dropped; re-baseline never downgraded; exceptions produced no report; `base == head` accepted
- CI: duplicate pnpm version vs `packageManager`; typecheck before build broke `@proofix/core` type resolution

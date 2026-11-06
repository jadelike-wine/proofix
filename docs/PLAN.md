# ProofFix — Plan & Progress

Legend: ✅ done · 🔵 in progress · ⬜ pending

## Milestone 1 — Research & architecture
- ✅ Competitor survey → `docs/research.md` (2026-11-06)
- ✅ DSH Cordis plugin API verified from installed npm packages (`dsh-tool-jobs`, `dsh-tools`, `dsh-base`, profile `cordis.patch.yml`)
- ✅ Architecture: `packages/core` (engine, zero deps beyond `yaml`), `packages/cli`, `packages/dsh-plugin` (thin adapter)
- ✅ Repo scaffold (pnpm workspace, TS NodeNext, vitest)

## Milestone 2 — Proof Mode (P0)
- ✅ git worktree isolation (detached HEAD, never touches user tree)
- ✅ frozen oracle (SHA-256 manifest, auto test-file globs + `--freeze`)
- ✅ RED / GREEN runs with environmental-failure heuristic
- ✅ negative control: `baseline-rerun` + `oracle-on-base` transplant
- ✅ regression stage
- ✅ tamper signals: oracle post-run integrity check + fix-modifies-tests → NEEDS_REVIEW/FAILED
- ✅ verdicts: VERIFIED / FAILED / INCONCLUSIVE / ERROR / NEEDS_REVIEW + evidence level
- ✅ JSON + self-contained HTML report + terminal rendering
- ✅ `proofix demo` — real end-to-end VERIFIED run confirmed on Windows
- ⬜ unit + integration tests (vitest)
- ⬜ benchmark cases (§7 spec)
- 🔵 verify command flags hardening (env scrub, timeouts) — implemented, needs tests

## Milestone 3 — DSH plugin (P1)
- ✅ `packages/dsh-plugin`: cordis plugin exporting name/inject/Config/apply
- ✅ tools: `proofix_verify`, `proofix_report` (contract-tested against mock ctx)
- ✅ packaging: esbuild bundle, self-contained tarball, `dsh.bundle.patch` insert layer
- ✅ install E2E: `dsh plugin --profile proofix-e2e add <tgz>` → composed into profile tree (`--dump-config` shows `proofix` row). Full agent boot not exercised — headless boot hangs on LLM init in this environment; documented honestly.
- ⬜ autofix loop tool (`proofix_autofix`, ≤3 rounds, structured failure feedback) — deferred; verify-only tools shipped

## Milestone 4 — Security & quality gates
- ✅ typecheck all packages strict-clean
- ✅ 24 vitest tests: verdict paths, env scrub, all 10 adversarial benchmark cases, risk classifier
- ✅ intentionally-broken reverse tests (tampering → NEEDS_REVIEW, deleted tests → not VERIFIED, vacuous → not VERIFIED)

## Milestone 5 — Release prep
- ✅ README.md (en, primary) + README.zh-CN.md, LICENSE, CONTRIBUTING, SECURITY, CHANGELOG
- ✅ .github issue/PR templates + CI workflow (3 OSes)
- ⬜ demo screenshot / artifact generation

## P2 — Risk-aware review
- ✅ `assessRisk()` in core: path-pattern classifier (auth, authz, payments, migrations, secrets, CI/CD, supply-chain, crypto, infra) + diff-content credential detection
- ✅ gate: high-risk VERIFIED → NEEDS_REVIEW; checklist + summary in report (JSON+HTML)

## Next actions
1. Optional: `proofix_autofix` tool for the DSH plugin (bounded fix loop).
2. Screenshot/artifact generation for README.
3. Clean up temp research dir + commit.

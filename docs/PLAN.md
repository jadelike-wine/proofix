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
- ⬜ `packages/dsh-plugin`: cordis plugin exporting name/inject/Config/apply
- ⬜ tools: `proofix_verify`, `proofix_status`, `proofix_report`
- ⬜ packaging + install instructions + compat check

## Milestone 4 — Security & quality gates
- ⬜ typecheck all packages in CI
- ⬜ vitest coverage of engine + tamper cases
- ⬜ intentionally-broken reverse tests (cheating fix → must not VERIFIED)

## Milestone 5 — Release prep
- ⬜ README.en.md (primary) + README.zh-CN.md, LICENSE, CONTRIBUTING, SECURITY, CHANGELOG
- ⬜ .github issue/PR templates + CI workflow
- ⬜ demo screenshot script

## Next actions
1. Write core unit/integration tests (oracle hashing, verdict paths, tamper detection).
2. Build benchmark case runner (10 spec cases).
3. Implement dsh-plugin package.

# ProofFix — Plan & Progress

Legend: ✅ done · 🔵 in progress · ⬜ pending

**Published: https://github.com/jadelike-wine/proofix** · release `v0.1.0` (installable tarballs attached)
**CI: green on ubuntu / windows / macos** (install → build → typecheck → test → `proofix demo`)

## Milestone 1 — Research & architecture ✅
- ✅ Competitor survey → `docs/research.md` (2026-11-06)
- ✅ DSH Cordis plugin API verified from installed npm packages, not from memory
- ✅ Architecture: `packages/core` (engine), `packages/cli`, `packages/dsh-plugin` (thin adapter)
- ✅ pnpm workspace, TS NodeNext, vitest

## Milestone 2 — Proof Mode (P0) ✅
- ✅ git worktree isolation (detached HEAD, user tree untouched)
- ✅ frozen oracle: SHA-256 + git mode, persisted baseline + append-only audit log
- ✅ RED / GREEN with environmental-failure discrimination
- ✅ negative control: `baseline-rerun` + `oracle-on-base` transplant, `--control-runs N`
- ✅ regression stage
- ✅ tamper signals → `NEEDS_REVIEW` / `FAILED`
- ✅ verdicts + evidence levels; JSON + self-contained HTML + terminal report
- ✅ `proofix demo` verified repeatedly, including from the installed release tarball

## Milestone 3 — DSH plugin (P1) ✅
- ✅ Cordis plugin: `name`/`inject`/`Config`/`apply`; tools `proofix_verify`, `proofix_report`, `proofix_autofix`
- ✅ bundled self-contained tarball with `dsh.bundle.patch` insert layer
- ✅ installed + composed into two real DSH profiles (`--dump-config` shows the row)
- ✅ mounts under the real Cordis `Context`/`ctx.plugin()` registry
- ⬜ live LLM-driven session E2E — blocked: headless profile has no DeepSeek API key

## Milestone 4 — Security & quality ✅
- ✅ typecheck + tests green on 3 OSes via CI
- ✅ 34 tests: verdict paths, env scrub, all 10 adversarial benchmark cases, risk classifier
- ✅ adversarial subagent code review → 10 real issues fixed (control-path crash, oracle globs, env scrub, timeout kill, audit downgrade, …)
- ✅ deliberately-broken reverse tests included (tampering, deletion, vacuous tests)

## Milestone 5 — Release ✅
- ✅ English README (primary) + 中文 README with badges
- ✅ MIT LICENSE, CONTRIBUTING, SECURITY, CHANGELOG
- ✅ issue templates, PR template, CI + release workflows
- ✅ install/uninstall docs, real screenshot + reproducible screenshot script
- ✅ launch copy drafts (unpublished, per spec)
- ⬜ npm registry publish — blocked on npm credentials (`@proofix` scope must exist)

## Next actions
1. `npm login` → publish `@proofix/cli` + `@proofix/dsh-plugin` (or add `NPM_TOKEN` secret and run the release workflow).
2. Optional: live plugin session with `DEEPSEEK_API_KEY`.
3. Optional hardening: container isolation, MCP adapter.

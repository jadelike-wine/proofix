# ProofFix — Verification Log

## Published
**Repository: https://github.com/jadelike-wine/proofix** (public, MIT)

## 2026-11-06 — Live LLM-driven plugin session (P1 E2E)

A real agent turn, driven by a **third-party OpenAI-compatible provider** (agnes-3.0-flash via
`llm-pi-ai`), called the plugin's tool inside DeepSeek Harness:

```
$ dsh --profile proofix-live --add-dir <demo-repo> \
  "Use the proofix_verify tool exactly once ... repo=<demo>, base=HEAD~1, head=HEAD, test='node test/cart.test.js'"
```

Agent's verbatim report of the tool result:

```
VERIFIED (medium)
the frozen oracle fails on the base revision and passes on the fixed revision
negative control: base fails the frozen oracle 1× — the failure is stable
no regression command provided; only the oracle was checked
report: ...\.proofix\reports\2026-11-06T11-06-56-988Z-4784f4\report.html
```

This closes the previously-open item: the plugin is exercised end-to-end by a real LLM
(no DeepSeek key required — any OpenAI-compatible provider works, configured via `llm-pi-ai`).

Profile used: `~/.dsh/profiles/proofix-live` (copy of the headless template + proofix plugin +
`agnes`/`sensenova`/`longcat`/`tokenking` provider block). Provider notes from the run:
`sensenova` returned HTTP 429 (rpm exhausted), `agnes` required `maxTokens ≤ 65536`.

## 2026-11-06 — CI on real GitHub infrastructure

| Check | Result |
|---|---|
| `ci` workflow, ubuntu-latest | ✅ green |
| `ci` workflow, windows-latest | ✅ green |
| `ci` workflow, macos-latest | ✅ green |
| Full CI duration | 59s–84s per run |
| CI steps | install → build → typecheck → test → `proofix demo` (end-to-end) |

This is the first **real Linux + macOS verification** of the engine (all earlier runs were Windows-only).

### CI bugs found and fixed (real, not cosmetic)
1. `pnpm/action-setup@v4` declared `version: 10` while `package.json` declared `packageManager: pnpm@10.33.4` → `ERR_PNPM_BAD_PM_VERSION`. Removed the duplicate.
2. `typecheck` ran before `build`, but `@proofix/cli` resolves `@proofix/core`'s emitted `.d.ts` → `TS2307: Cannot find module '@proofix/core'`. Reordered to build → typecheck.

## 2026-11-06 (local rounds 1–23)

| Check | Command | Result |
|---|---|---|
| Build | `pnpm -r run build` | ✅ core + cli compile (tsc, strict) |
| Demo | `node packages/cli/dist/bin.js demo` | ✅ VERIFIED, evidence: high — RED fail / GREEN pass / CONTROL fail / REGRESS pass, oracle intact |
| Tests | `npx vitest run` (packages/core) | ✅ 9/9 pass — VERIFIED, FAILED, NEEDS_REVIEW (test tampering), INCONCLUSIVE paths all exercised against real temp git repos on Windows |
| Env | `git 2.49.0.windows.1`, `node v22.23.1`, `pnpm 10.33.4`, win32/x64 | ✅ |

| Tests | `pnpm -r run test` | ✅ 19/19 pass — `verify.test.ts` (9) + `benchmark.test.ts` (all 10 spec cases) against real temp git repos on Windows |
| Benchmark §7 | `npx vitest run test/benchmark.test.ts` | ✅ 10/10 — real fix VERIFIED; non-fix FAILED; test edit NEEDS_REVIEW; test deletion not-VERIFIED; no-bug INCONCLUSIVE; env ERROR; flaky not-VERIFIED; regression FAILED; unreproducible INCONCLUSIVE; vacuous-test not-VERIFIED |
| Typecheck | `pnpm -r run typecheck` | ✅ all 3 packages strict-clean |
| DSH plugin load | `node -e "import('./dist/index.js')"` | ✅ exports name/inject/Config/apply; compiles against `@deepseek-ai/cordis 4.1.0` + `dsh-tools 0.1.2-rc.1` type declarations |
| DSH plugin install (E2E) | `dsh plugin --profile proofix-e2e add <tgz>` | ✅ installs into fresh profile; `dsh.profile.bundles` gains `@proofix/dsh-plugin`; `--dump-config` composes the `proofix` plugin row via `insert:` patch. Full agent-boot E2E not run (headless boot hangs on LLM init — noted honestly, plugin wiring covered by contract test + composed-tree validation) |
| Plugin contract | `packages/dsh-plugin` vitest | ✅ 2/2 — registers `proofix_verify` + `proofix_report` against mock ctx |
| Risk review (P2) | `packages/core` vitest `risk.test.ts` | ✅ 5/5 — auth/payments/migrations → high; CI/lockfiles → medium; plain code → low; diff-embedded credentials escalate |
| Oracle baseline audit | `oracle-baseline.test.ts` | ✅ persisted `.proofix/oracle.json`; `oracle-history.jsonl` append-only audit; changed test surface flagged `rebaselined` with previous digest |
| Screenshot | `scripts/screenshot.mjs` | ✅ real `docs/assets/demo-report.png` from a live demo run via headless Edge |
| Standalone install (E2E) | `npm install proofix-cli-0.1.0.tgz` in a clean dir → `npx proofix demo` | ✅ tarball installs with 0 deps; `demo` → VERIFIED, evidence: high. The published package will be self-contained (engine + commander + yaml bundled via esbuild) |
| Cordis runtime mount | `packages/dsh-plugin` `cordis-mount.test.ts` | ✅ plugin mounts through the real `Context`/`ctx.plugin()` registry and registers all 3 tools |
| `proofix oracle` CLI | `oracle --dir <demo-repo>` | ✅ prints baseline digest + freeze history |
| Adversarial code review | independent subagent audit of `packages/core` | found 10 real issues; **fixed**: control-path crash ≠ bug detection (P0), `conftest.py`/test-config added to oracle globs (P0), `checkOracle` honors `--freeze` globs (P0), env heuristic stderr-only, `AWS_ACCESS_KEY_ID`/`DATABASE_URL`/`BEARER` env scrub, Windows `taskkill /T /F` timeout kill, manifest read failures fail loudly, oracle re-baseline → NEEDS_REVIEW, pipeline exceptions → ERROR report, base==head rejected. New `control.test.ts` pins both |
| POSIX group-kill | `runner.ts` `detached: !isWin` | ✅ `process.kill(-pid)` now targets a real process group |

### Bugs found & fixed during development
1. Demo fixture test imported `./src/cart.js` from `test/` → `ERR_MODULE_NOT_FOUND` on base; env-heuristic correctly downgraded to ERROR rather than misreporting. Fixed import to `../src/cart.js`.
2. Final verdict stayed `ERROR` after a fully successful pipeline (initial value returned early). Fixed by setting `VERIFIED` unconditionally once all stages pass.
3. `package.json` files gained UTF-8 BOM via a PowerShell edit → broke vite PostCSS config loading under vitest. Stripped.
4. Flaky benchmark test needed `FAILED` as an honest outcome (flaky fail on green), not just INCONCLUSIVE.
5. Plugin tarball pulled workspace dep `@proofix/core` from registry → 404. Fixed by bundling the engine into `dist/index.js` via esbuild (`@deepseek-ai/*` external); `dependencies: {}` — self-contained tarball.
6. `dsh.bundle.patch` semantics: entries need `insert:` list to append plugin rows (id-only entries patch *existing* rows). Verified via `--dump-config` schema + actual compose.

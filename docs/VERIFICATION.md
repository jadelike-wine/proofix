# ProofFix — Verification Log

## 2026-11-06 (Round 1)

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

### Bugs found & fixed during development
1. Demo fixture test imported `./src/cart.js` from `test/` → `ERR_MODULE_NOT_FOUND` on base; env-heuristic correctly downgraded to ERROR rather than misreporting. Fixed import to `../src/cart.js`.
2. Final verdict stayed `ERROR` after a fully successful pipeline (initial value returned early). Fixed by setting `VERIFIED` unconditionally once all stages pass.
3. `package.json` files gained UTF-8 BOM via a PowerShell edit → broke vite PostCSS config loading under vitest. Stripped.
4. Flaky benchmark test needed `FAILED` as an honest outcome (flaky fail on green), not just INCONCLUSIVE.
5. Plugin tarball pulled workspace dep `@proofix/core` from registry → 404. Fixed by bundling the engine into `dist/index.js` via esbuild (`@deepseek-ai/*` external); `dependencies: {}` — self-contained tarball.
6. `dsh.bundle.patch` semantics: entries need `insert:` list to append plugin rows (id-only entries patch *existing* rows). Verified via `--dump-config` schema + actual compose.

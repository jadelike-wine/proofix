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

### Bugs found & fixed during development
1. Demo fixture test imported `./src/cart.js` from `test/` → `ERR_MODULE_NOT_FOUND` on base; env-heuristic correctly downgraded to ERROR rather than misreporting. Fixed import to `../src/cart.js`.
2. Final verdict stayed `ERROR` after a fully successful pipeline (initial value returned early). Fixed by setting `VERIFIED` unconditionally once all stages pass.
3. `package.json` files gained UTF-8 BOM via a PowerShell edit → broke vite PostCSS config loading under vitest. Stripped.
4. Flaky benchmark test needed `FAILED` as an honest outcome (flaky fail on green), not just INCONCLUSIVE.

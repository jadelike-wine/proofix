# ProofFix — Competitive & Technical Research

Research date: **2026-11-06** · Conducted against live repositories and the local DeepSeek Harness installation (desktop `0.2.2-rc.1`).

## Sources

| Source | Status |
|---|---|
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | ✅ exists (MIT, `master` branch, developer preview) |
| [@deepseek-ai/dsh-base on npm](https://registry.npmjs.org/@deepseek-ai/dsh-base) | ✅ dist-tags: `latest 0.0.1-rc.1`, `next 0.2.2-rc.1`, `alpha 0.2.2-alpha.3` |
| [263311487-ux/dsh-verify](https://github.com/263311487-ux/dsh-verify) | ✅ exists (MIT, "Witness" — browser acceptance checks) |
| [PerryLink/dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck) | ✅ exists (Apache-2.0, delivery quality gate) |
| [cyanseek/dsh-autofix](https://github.com/cyanseek/dsh-autofix) | ✅ exists (MIT, tool-error recovery — orthogonal) |
| [The-PR-Agent/pr-agent](https://github.com/The-PR-Agent/pr-agent) | ✅ exists (MIT, LLM PR reviewer; ex-Qodo) |
| [Anthropic: Solving code review](https://claude.dev/blog/solving-code-review-at-anthropic/) | ✅ exists (Oct 2026, process blog) |

## DeepSeek Harness plugin architecture (verified from installed packages)

DSH is built on **Cordis** (`@deepseek-ai/cordis`, peer dep `^4.x`). Verified by downloading and reading `dsh-tool-jobs@0.1.2-rc.1`, `dsh-tools@0.1.2-rc.1`, `dsh-base` metadata, and the local profile at `~/.dsh/profiles/desktop/`:

- A **profile** is `package.json` + `cordis.yml` (empty root `[]`) + `cordis.patch.yml`.
- **Bundles** are npm packages listed in `package.json → dsh.profile.bundles`; each contributes a `dsh.bundle.patch` (a `cordis.patch.yml` layer).
- `cordis.patch.yml` is a top-level YAML array of entries: `{ id, name: "<npm package>", config: {...} }` — id-targeted config overrides, disables, and insert lists; `!!js` expressions allowed.
- A **plugin package** is an ESM npm module exporting:
  - `name: string`
  - `inject: string[]` — required services (e.g. `["tools", "jobs", "systemPrompt"]`)
  - `Config` — a `@deepseek-ai/schemastery` (zod-like) schema
  - `apply(ctx: Context, config): void`
- **Tools** are registered via `ctx.tools.register(defineTool({ name, description, parameters, output: { schema, render }, execute(args, exec), presentCall }))`. `parameters` is a JSON-schema-ish spec: `{ field: { type, required, description, enum?, items? } }`.
- **System prompt** sections via `ctx.systemPrompt.section({ name, order, text })`.
- Third-party plugins install via `dsh plugin add <pkg>` (per dsh-doublecheck README).
- The API is **pre-1.0 / rc** — breaking changes expected; pin against `@deepseek-ai/cordis ^4.0.2` and document the tested host version (`0.1.2-rc.1`/`0.2.2-rc.1`).

## Competitor capability matrix

| Capability | dsh-verify | dsh-doublecheck | dsh-autofix | PR-Agent | ProofFix |
|---|---|---|---|---|---|
| Browser/UI assertions | ✅ core | ❌ | ❌ | ❌ | out of scope |
| Red→green evidence check | in own CI | ✅ session-log gate | ❌ | ❌ | ✅ execution-based |
| **Baseline bug reproduction (worktree)** | ❌ | ❌ | ❌ | ❌ | ✅ **unique** |
| **Frozen oracle + SHA-256 tamper detection** | ❌ | ❌ | ❌ | ❌ | ✅ **unique** |
| **Negative control** | ❌ | ❌ | ❌ | ❌ | ✅ **unique** |
| Standalone proof report | HTML+JSON | MD+JSON+SARIF | ❌ | ❌ | ✅ JSON+HTML |
| Zero-API-cost verdicts | ✅ | ⚠️ partial | ✅ | ❌ (LLM) | ✅ |
| DSH plugin | ✅ | ✅ | ✅ | ❌ | ✅ planned |

## Differentiation (what ProofFix will actually build)

1. **Baseline reproduction in a detached git worktree** — prove the bug exists on the pre-fix commit, not just that tests "went green".
2. **Frozen oracle** — SHA-256 manifest of every test file + the acceptance command; post-run integrity check catches a fix that edits/deletes/skips tests.
3. **Negative control** — re-run the oracle on base (stable-failure check) or transplant fix-added tests onto base code (vacuous-test check).
4. **LLM-free verdict** — VERIFIED/FAILED/INCONCLUSIVE/ERROR/NEEDS_REVIEW from process exit codes, not a model's opinion.
5. **Agent-agnostic core** — engine is a plain Node library; DSH plugin, MCP server, GitHub Action are thin adapters (only the DSH adapter ships in MVP).

## Reuse, not rebuild

- `git worktree` (native) for isolation — no container dependency for MVP; document that untrusted-repo execution should use OS-level sandboxing.
- Node `child_process.spawn` with shell + timeout + env scrubbing for test execution.
- Static HTML report (no framework).
- `@deepseek-ai/schemastery` for plugin Config only inside `packages/dsh-plugin`.

## Risks

- DSH plugin API is rc-quality → pin versions, keep plugin a thin adapter over `@proofix/core` so breakage is contained.
- Windows worktree+shell quirks → demo must be a real end-to-end run on Windows (done).
- "Environment vs bug" classification is heuristic → conservative: anything ambiguous degrades to ERROR/INCONCLUSIVE, never VERIFIED.

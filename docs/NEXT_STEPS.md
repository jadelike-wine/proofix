# Next Steps

## Done
- P0 Proof Mode (worktrees, frozen oracle + persisted baseline/audit, negative control, regression, reports) — verified
- P1 DSH plugin (3 tools, bundled, install-verified into real profiles, real Cordis mount test) — agent-boot E2E needs a DeepSeek key
- P2 Risk-aware review — deterministic classifier + gates
- Release prep: READMEs (en/zh), LICENSE, SECURITY, CONTRIBUTING, CHANGELOG, CI, templates, screenshot script, launch copy
- 32 tests green (core 25, cli 4, plugin 3); typecheck+lint clean

## Remaining (needs user)
1. GitHub repo creation + `npm publish` of `@proofix/cli` and `@proofix/dsh-plugin`.
2. `DEEPSEEK_API_KEY` in a test profile → live agent-session plugin check.
3. Optional hardening: container isolation for untrusted repos, N-rerun flakiness control, MCP/GitHub-Action adapters (deferred per phase-1 scope).

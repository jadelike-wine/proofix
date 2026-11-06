# Known Issues

1. **Missing oracle on base → ERROR** (conservative by design): when the acceptance tests don't exist on the base revision, the RED run fails with module-not-found which the environmental heuristic maps to ERROR rather than an implicit red. A future version could skip RED and rely solely on the `oracle-on-base` transplant control.
2. **Environmental heuristic is regex-based** — may misclassify exotic setups; it only ever downgrades (ERROR/INCONCLUSIVE), never upgrades to VERIFIED.
3. **No container isolation** — test commands run as the current user inside a worktree. Env scrubbing strips credential-shaped variables but is not a sandbox; for untrusted repos run ProofFix inside a VM/container (see SECURITY.md).
4. **Flakiness**: single control re-run. High-variance suites may want N reruns — future flag.
5. **Full agent-boot E2E of the DSH plugin not exercised**: headless profile lacks a DeepSeek API key in this environment. Verified instead: `dsh plugin add` install into two real profiles, `--dump-config` composes the plugin row, `dsh headless` boots past plugin mount, and `ctx.plugin()` mounts under real Cordis.
6. Env scrub substring matching may over-strip benign vars containing `token`/`secret` (e.g. `CSRF_TOKEN_NAME`) — use `passEnv` to allowlist.

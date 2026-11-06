# Known Issues

1. **Missing oracle on base → ERROR** (by design, conservative): when the acceptance tests don't exist on the base revision, the RED run fails with a module-not-found error that the environmental heuristic maps to ERROR rather than treating "oracle absent" as implicit red. A future version could skip RED and rely solely on the `oracle-on-base` transplant control.
2. **Environmental heuristic is regex-based** — may misclassify exotic setups; it only ever downgrades (ERROR/INCONCLUSIVE), never upgrades to VERIFIED.
3. **No container isolation** — test commands run as the current user inside a worktree. For untrusted repos use OS-level sandboxing (documented); keep `--keep-worktrees` off.
4. **Flakiness**: single control re-run. High-variance suites may want N reruns — future flag.
5. **DSH plugin** not yet implemented.
6. `packages/report` and `packages/dsh-plugin` dirs exist but are empty scaffolds.

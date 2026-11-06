# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories on this
repository. Do not open public issues for unpatched vulnerabilities.

## Threat model

ProofFix executes **user-supplied test commands** inside git worktrees of the
target repository. This is intentional — the acceptance test is arbitrary code
by definition. Consequences and mitigations:

| Risk | Mitigation shipped |
|---|---|
| Test command harms the main working tree | Runs only inside detached worktrees under `.proofix/worktrees`; the user's checkout is never modified |
| Test command exfiltrates credentials | Subprocess env scrubbed of `*TOKEN*`/`*SECRET*`/`*KEY*`/`*PASSWORD*`/`*AUTH*`/`*CREDENTIAL*` unless explicitly passed via `passEnv` |
| Hung runaway tests | Per-command timeout (default 10 min) with process kill |
| Malicious repo config | `GIT_TERMINAL_PROMPT=0`; no git config changes are made; no push/fetch is ever run |
| Candidate fix tampers with tests | SHA-256 frozen oracle + post-run integrity check → FAILED/NEEDS_REVIEW |
| ProofFix phones home | It never does. No network calls exist in `@proofix/core`. |

## Hard boundaries (what ProofFix will NOT do)

- Never run unknown-repo scripts in the main working tree.
- Never modify global git configuration.
- Never push, publish, or upload anything.
- Never read `~/.ssh`, `~/.aws`, credential files, or the OS keychain.

## Untrusted repositories

If you must verify a repository you do not trust, run the entire `proofix`
process inside a container or VM with no credentials mounted. Env scrubbing
reduces casual exfiltration but is **not** a sandbox — a malicious test can
still read world-readable files or open network connections from inside the
worktree.

## Supported versions

Only the latest release receives security fixes.

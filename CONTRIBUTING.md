# Contributing to ProofFix

Thanks for helping make AI-proposed fixes trustworthy.

## Setup

```bash
pnpm install
pnpm build        # builds packages/*
pnpm test         # vitest suites (integration tests create real temp git repos)
pnpm demo         # end-to-end demo verification
```

## Principles

1. **The verdict is sacred.** Never let a weak signal produce `VERIFIED`. When in doubt, degrade to `INCONCLUSIVE`, `ERROR`, or `NEEDS_REVIEW`.
2. **Zero API cost in Proof Mode.** `@proofix/core` must not import anything that calls an LLM or a network service.
3. **Tests prove behavior.** New verdict logic needs an integration test that builds a real git repo exercising it — see `packages/core/test/benchmark.test.ts`.
4. **Don't fake green.** Don't delete tests, weaken assertions, or skip checks to pass CI.
5. **Keep the engine agent-agnostic.** Agent-specific code lives in `packages/dsh-plugin` (or future adapters), not in `core`.

## Commit & PR

- Small, focused PRs; describe the verdict/benchmark impact of behavior changes.
- Run `pnpm typecheck && pnpm test` before submitting.

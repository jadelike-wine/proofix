import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests build real git repos and run node subprocesses —
    // under parallel file workers they can exceed vitest's 5s default.
    testTimeout: 30_000,
    // Test files run in parallel by default; git ops within a file are sequential.
    pool: 'forks',
  },
});

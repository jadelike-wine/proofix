#!/usr/bin/env node
import { runCli } from './cli.js';

runCli(process.argv).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`proofix: error: ${msg}`);
  process.exitCode = 1;
});

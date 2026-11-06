export { verify, PROOFIX_VERSION, ProofixError } from './verify.js';
export { freezeOracle, checkOracle, transplantOracle, DEFAULT_ORACLE_GLOBS } from './oracle.js';
export { runCommand, classify, looksEnvironmental, scrubEnv } from './runner.js';
export { renderHtmlReport } from './html.js';
export { assessRisk } from './risk.js';
export type { RiskAssessment, RiskCategory, RiskLevel, RiskHit } from './risk.js';
export { createDemoRepo, demoVerifyOptions } from './demo.js';
export * from './types.js';

/**
 * Terminal rendering of a ProofReport — the same information as the HTML,
 * formatted for a shell.
 */
import type { ProofReport, StageResult } from '@proofix/core';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  purple: '\x1b[35m',
  orange: '\x1b[38;5;208m',
};

const VERDICT_STYLE: Record<string, string> = {
  VERIFIED: C.green,
  FAILED: C.red,
  INCONCLUSIVE: C.yellow,
  ERROR: C.purple,
  NEEDS_REVIEW: C.orange,
};

function stageLine(name: string, stage: StageResult | null): string {
  if (!stage) return `  ${C.dim}○ ${name}: skipped${C.reset}`;
  const icon = stage.outcome === 'pass' ? `${C.green}✓` : stage.outcome === 'fail' ? `${C.red}✗` : `${C.purple}!`;
  const exit = stage.command.exitCode ?? 'n/a';
  const secs = (stage.command.durationMs / 1000).toFixed(1);
  const note = stage.note ? ` ${C.dim}— ${stage.note}${C.reset}` : '';
  return `  ${icon} ${name}: ${stage.outcome.toUpperCase()}${C.reset} ${C.dim}(exit ${exit}, ${secs}s)${C.reset}${note}`;
}

export function renderTerminalReport(r: ProofReport): string {
  const v = `${VERDICT_STYLE[r.verdict] ?? ''}${C.bold}${r.verdict}${C.reset}`;
  const lines: string[] = [];
  lines.push('');
  lines.push(`${C.bold}ProofFix Report${C.reset}  ${v}  ${C.dim}evidence: ${r.evidence}${C.reset}`);
  lines.push(`${C.dim}${r.git.baseSha.slice(0, 10)} "${r.git.baseSubject}" → ${r.git.headSha.slice(0, 10)} "${r.git.headSubject}"${C.reset}`);
  lines.push('');
  lines.push(stageLine('RED      (base)', r.stages.red));
  lines.push(stageLine('GREEN    (head)', r.stages.green));
  lines.push(stageLine(`CONTROL  ${r.stages.control ? `(${r.stages.control.kind})` : ''}`, r.stages.control));
  lines.push(stageLine('REGRESS  (head)', r.stages.regression));
  lines.push('');
  if (r.oracle.headCheck && !r.oracle.headCheck.intact) {
    lines.push(`  ${C.red}oracle integrity VIOLATED${C.reset}`);
  } else {
    lines.push(`  ${C.dim}oracle: ${r.oracle.manifest.files.length} file(s) frozen, integrity intact${C.reset}`);
  }
  if (r.oracle.oracleFilesChangedByFix.length > 0) {
    lines.push(`  ${C.yellow}⚠ fix touched oracle files: ${r.oracle.oracleFilesChangedByFix.join(', ')}${C.reset}`);
  }
  lines.push('');
  for (const reason of r.reasons) lines.push(`  ${C.dim}·${C.reset} ${reason}`);
  lines.push('');
  lines.push(`  ${C.dim}report: ${r.artifacts.html}${C.reset}`);
  lines.push('');
  return lines.join('\n');
}

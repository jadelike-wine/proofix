/**
 * Static HTML proof report — self-contained, no external assets, safe to
 * screenshot and share. Escapes every dynamic string.
 */
import type { ProofReport, StageResult } from './types.js';

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function code(s: string, cls = ''): string {
  return `<pre class="code ${cls}">${esc(s)}</pre>`;
}

const VERDICT_COLOR: Record<string, string> = {
  VERIFIED: '#15803d',
  FAILED: '#b91c1c',
  INCONCLUSIVE: '#a16207',
  ERROR: '#6d28d9',
  NEEDS_REVIEW: '#c2410c',
};

function stageBlock(title: string, expectation: string, stage: StageResult | null): string {
  if (!stage) {
    return `<section class="stage skipped"><h3>${esc(title)} <span class="expect">${esc(expectation)}</span></h3><p class="muted">not executed</p></section>`;
  }
  const badge = stage.outcome.toUpperCase();
  const badgeCls = stage.outcome === 'pass' ? 'pass' : stage.outcome === 'fail' ? 'fail' : 'err';
  const dur = (stage.command.durationMs / 1000).toFixed(1);
  const out = [stage.command.stdout, stage.command.stderr].filter(Boolean).join('\n');
  return `<section class="stage">
<h3>${esc(title)} <span class="expect">${esc(expectation)}</span> <span class="badge ${badgeCls}">${badge}</span></h3>
${stage.note ? `<p class="note">${esc(stage.note)}</p>` : ''}
<p class="muted"><code>${esc(stage.command.command)}</code> — exit ${stage.command.exitCode ?? 'n/a'} in ${dur}s${stage.command.timedOut ? ' (timed out)' : ''}</p>
${out ? code(out.length > 8000 ? out.slice(0, 8000) + '\n…[truncated]' : out) : '<p class="muted">(no output)</p>'}
</section>`;
}

export function renderHtmlReport(r: ProofReport): string {
  const color = VERDICT_COLOR[r.verdict] ?? '#333';
  const oracleRows = r.oracle.manifest.files
    .map(
      (f) =>
        `<tr><td class="mono">${esc(f.path)}</td><td class="mono small">${esc(f.sha256.slice(0, 16))}…</td><td>${f.bytes}</td><td>${f.presentInBase ? 'yes' : 'added by fix'}</td></tr>`,
    )
    .join('');
  const changedRows = r.git.changedFiles.map((f) => `<li class="mono">${esc(f)}</li>`).join('');
  const reasons = r.reasons.map((s) => `<li>${esc(s)}</li>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProofFix Report — ${esc(r.verdict)}</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#f6f7f9;color:#1f2430;line-height:1.55}
.wrap{max-width:960px;margin:0 auto;padding:32px 24px 64px}
header.hero{background:#fff;border:1px solid #e3e6ec;border-radius:12px;padding:28px 32px;margin-bottom:24px}
.brand{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280}
.verdict{font-size:44px;font-weight:800;color:${color};margin:4px 0 2px}
.evidence{color:#4b5563;font-size:15px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.card{background:#fff;border:1px solid #e3e6ec;border-radius:12px;padding:18px 22px}
.card h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin:0 0 10px}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0;font-size:14px}
dt{color:#6b7280}dd{margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;word-break:break-all}
ul{margin:6px 0;padding-left:20px}
.stage{background:#fff;border:1px solid #e3e6ec;border-radius:12px;padding:18px 22px;margin-bottom:16px}
.stage h3{margin:0 0 6px;font-size:16px}
.stage.skipped{opacity:.65}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;vertical-align:middle}
.badge.pass{background:#dcfce7;color:#15803d}
.badge.fail{background:#fee2e2;color:#b91c1c}
.badge.err{background:#ede9fe;color:#6d28d9}
.expect{font-weight:400;font-size:12px;color:#6b7280}
.code{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:8px;overflow:auto;font-size:12.5px;font-family:ui-monospace,Menlo,Consolas,monospace;max-height:420px}
.note{background:#fffbeb;border-left:3px solid #f59e0b;padding:8px 12px;border-radius:4px}
.muted{color:#6b7280;font-size:13px}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}
.small{font-size:11px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #eceff3}
th{color:#6b7280;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
footer{color:#9ca3af;font-size:12px;text-align:center;margin-top:32px}
h2.sec{font-size:18px;margin:28px 0 12px}
</style></head><body><div class="wrap">

<header class="hero">
  <div class="brand">ProofFix · Proof Report</div>
  <div class="verdict">${esc(r.verdict)}</div>
  <div class="evidence">evidence level: <strong>${esc(r.evidence)}</strong> · generated ${esc(r.env.finishedAt)} · proofix ${esc(r.tool.version)}</div>
</header>

<div class="grid">
  <div class="card"><h2>Revisions</h2><dl>
    <dt>base</dt><dd>${esc(r.git.baseSha.slice(0, 12))} ${esc(r.git.baseSubject)}</dd>
    <dt>head</dt><dd>${esc(r.git.headSha.slice(0, 12))} ${esc(r.git.headSubject)}</dd>
    <dt>repo</dt><dd>${esc(r.git.repoRoot)}</dd>
    <dt>changed</dt><dd>${r.git.changedFiles.length} file(s)</dd>
  </dl></div>
  <div class="card"><h2>Environment</h2><dl>
    <dt>platform</dt><dd>${esc(r.env.platform)}/${esc(r.env.arch)}</dd>
    <dt>node</dt><dd>${esc(r.env.node)}</dd>
    <dt>git</dt><dd>${esc(r.env.git)}</dd>
    <dt>duration</dt><dd>${(r.env.durationMs / 1000).toFixed(1)}s</dd>
  </dl></div>
</div>

<div class="card"><h2>Why this verdict</h2><ul>${reasons}</ul></div>

<h2 class="sec">Verification stages</h2>
${stageBlock('RED — base revision', 'expected: FAIL', r.stages.red)}
${stageBlock('GREEN — fixed revision', 'expected: PASS', r.stages.green)}
${stageBlock(`NEGATIVE CONTROL${r.stages.control ? ` (${r.stages.control.kind})` : ''}`, 'expected: FAIL', r.stages.control)}
${stageBlock('REGRESSION — fixed revision', 'expected: PASS', r.stages.regression)}

<h2 class="sec">Frozen oracle</h2>
<div class="card">
<p class="muted">test command: <code>${esc(r.oracle.manifest.testCommand)}</code>${r.oracle.manifest.setupCommand ? ` · setup: <code>${esc(r.oracle.manifest.setupCommand)}</code>` : ''}${r.oracle.manifest.regressionCommand ? ` · regression: <code>${esc(r.oracle.manifest.regressionCommand)}</code>` : ''}<br>
frozen at ${esc(r.oracle.manifest.frozenAt)} · digest <span class="mono">${esc(r.oracle.manifest.digest.slice(0, 24))}…</span>
${r.oracle.headCheck ? ` · post-run integrity: <strong>${r.oracle.headCheck.intact ? 'intact' : 'VIOLATED'}</strong>` : ''}</p>
${r.oracle.oracleFilesChangedByFix.length ? `<p class="note">⚠ the fix modified oracle files: ${r.oracle.oracleFilesChangedByFix.map(esc).join(', ')}</p>` : ''}
<table><thead><tr><th>file</th><th>sha-256</th><th>bytes</th><th>in base</th></tr></thead><tbody>${oracleRows || '<tr><td colspan="4" class="muted">no test files matched the oracle globs</td></tr>'}</tbody></table>
</div>

<h2 class="sec">Risk assessment</h2>
<div class="card">
<p><strong style="color:${r.risk.level === 'high' ? '#b91c1c' : r.risk.level === 'medium' ? '#a16207' : '#15803d'}">${r.risk.level.toUpperCase()}</strong> — ${esc(r.risk.gate.summary)}</p>
${r.risk.gate.checklist.length ? `<ul>${r.risk.gate.checklist.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
${r.risk.hits.length ? `<table><thead><tr><th>category</th><th>level</th><th>files</th><th>reason</th></tr></thead><tbody>${r.risk.hits.map((h) => `<tr><td>${esc(h.category)}</td><td>${esc(h.level)}</td><td class="mono small">${h.files.map(esc).join('<br>') || '—'}</td><td>${esc(h.reason)}</td></tr>`).join('')}</tbody></table>` : ''}
</div>

<h2 class="sec">Changed files (base → head)</h2>
<div class="card"><ul>${changedRows || '<li class="muted">none</li>'}</ul>
${r.git.diff ? `<details><summary class="muted">diff${r.git.diffTruncated ? ' (truncated)' : ''}</summary>${code(r.git.diff)}</details>` : ''}
</div>

<h2 class="sec">Reproduce</h2>
<div class="card">${code(r.reproduce)}</div>

<footer>ProofFix — "Your AI fixed the bug. Now prove it." · report ${esc(r.artifacts.json)}</footer>
</div></body></html>`;
}

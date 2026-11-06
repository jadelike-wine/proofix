var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// ../core/dist/types.js
var types_exports = {};
__export(types_exports, {
  ProofixError: () => ProofixError
});
var ProofixError;
var init_types = __esm({
  "../core/dist/types.js"() {
    "use strict";
    ProofixError = class extends Error {
      code;
      constructor(message, code2) {
        super(message);
        this.code = code2;
        this.name = "ProofixError";
      }
    };
  }
});

// ../core/dist/git.js
var git_exports = {};
__export(git_exports, {
  addWorktree: () => addWorktree,
  changedFiles: () => changedFiles,
  diffBetween: () => diffBetween,
  git: () => git,
  gitVersion: () => gitVersion,
  listFiles: () => listFiles,
  lsFilesModes: () => lsFilesModes,
  removeWorktree: () => removeWorktree,
  repoRoot: () => repoRoot,
  resolveRev: () => resolveRev
});
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
async function git(args, opts) {
  try {
    const { stdout, stderr } = await execFileP("git", args, {
      cwd: opts.cwd,
      maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
      windowsHide: true
    });
    return { stdout: stdout.toString(), stderr: stderr.toString(), code: 0 };
  } catch (err) {
    const e = err;
    if (opts.allowFail) {
      return { stdout: e.stdout?.toString() ?? "", stderr: e.stderr?.toString() ?? e.message ?? "", code: e.code ?? 1 };
    }
    throw new ProofixError(`git ${args.join(" ")} failed: ${e.stderr?.toString().trim() || e.message}`, "io");
  }
}
async function gitVersion() {
  try {
    const { stdout } = await execFileP("git", ["--version"], { windowsHide: true });
    return stdout.toString().trim();
  } catch {
    return "unavailable";
  }
}
async function repoRoot(repo) {
  const abs = path.resolve(repo);
  const res = await git(["rev-parse", "--show-toplevel"], { cwd: abs, allowFail: true });
  if (res.code !== 0 || !res.stdout.trim()) {
    throw new ProofixError(`${abs} is not inside a git repository`, "not-a-repo");
  }
  return res.stdout.trim();
}
async function resolveRev(root, rev) {
  const res = await git(["rev-parse", "--verify", `${rev}^{commit}`], { cwd: root, allowFail: true });
  if (res.code !== 0 || !res.stdout.trim()) {
    throw new ProofixError(`cannot resolve revision "${rev}"`, "bad-revision");
  }
  const sha = res.stdout.trim();
  const subj = await git(["log", "-1", "--format=%s", sha], { cwd: root, allowFail: true });
  return { sha, subject: subj.stdout.trim() };
}
async function changedFiles(root, baseSha, headSha) {
  const res = await git(["diff", "--name-only", "-z", baseSha, headSha], { cwd: root, allowFail: true });
  if (res.code !== 0)
    return [];
  return res.stdout.split("\0").filter((s) => s.length > 0);
}
async function diffBetween(root, baseSha, headSha, maxBytes = 256 * 1024) {
  const res = await git(["diff", baseSha, headSha], { cwd: root, allowFail: true, maxBuffer: 64 * 1024 * 1024 });
  const diff = res.stdout;
  if (Buffer.byteLength(diff, "utf8") <= maxBytes)
    return { diff, truncated: false };
  return { diff: diff.slice(0, maxBytes), truncated: true };
}
async function addWorktree(root, dir, sha) {
  await fs.mkdir(path.dirname(dir), { recursive: true });
  const res = await git(["worktree", "add", "--detach", "--force", dir, sha], { cwd: root, allowFail: true });
  if (res.code !== 0) {
    throw new ProofixError(`git worktree add ${dir} ${sha} failed: ${res.stderr.trim()}`, "worktree-failed");
  }
}
async function removeWorktree(root, dir) {
  await git(["worktree", "remove", "--force", dir], { cwd: root, allowFail: true });
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {
  });
}
async function lsFilesModes(worktreeDir, patterns) {
  const map = /* @__PURE__ */ new Map();
  if (patterns.length === 0)
    return map;
  const res = await git(["ls-files", "-s", "-z", "--", ...patterns], { cwd: worktreeDir, allowFail: true });
  if (res.code !== 0)
    return map;
  for (const rec of res.stdout.split("\0").filter(Boolean)) {
    const tab = rec.indexOf("	");
    if (tab === -1)
      continue;
    const mode = rec.slice(0, rec.indexOf(" "));
    map.set(rec.slice(tab + 1), mode);
  }
  return map;
}
async function listFiles(worktreeDir, patterns) {
  if (patterns.length === 0)
    return [];
  const res = await git(["ls-files", "-z", "--", ...patterns], { cwd: worktreeDir, allowFail: true });
  if (res.code !== 0)
    return [];
  return res.stdout.split("\0").filter((s) => s.length > 0);
}
var execFileP;
var init_git = __esm({
  "../core/dist/git.js"() {
    "use strict";
    init_types();
    execFileP = promisify(execFile);
  }
});

// src/index.ts
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

// ../core/dist/verify.js
init_git();
import fs3 from "node:fs/promises";
import path4 from "node:path";
import crypto from "node:crypto";

// ../core/dist/oracle.js
init_git();
import { createHash } from "node:crypto";
import fs2 from "node:fs/promises";
import path2 from "node:path";
var DEFAULT_ORACLE_GLOBS = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
  "**/testdata/**",
  "**/*_test.go",
  "**/test_*.py",
  "**/conftest.py",
  "**/conftest.*",
  "**/jest.config.*",
  "**/vitest.config.*",
  "**/pytest.ini",
  "**/tox.ini",
  "**/.mocharc*",
  "**/pyproject.toml",
  "**/setup.cfg"
];
async function hashFile(root, rel) {
  try {
    const buf = await fs2.readFile(path2.join(root, rel));
    return { sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.byteLength };
  } catch {
    return null;
  }
}
function combinedDigest(entries) {
  const h = createHash("sha256");
  for (const e of entries)
    h.update(`${e.path}\0${e.sha256}\0${e.mode ?? ""}\0`);
  return h.digest("hex");
}
async function freezeOracle(params) {
  const globs = [...DEFAULT_ORACLE_GLOBS, ...params.extraGlobs ?? []];
  const headFiles = await listFiles(params.headDir, globs);
  const baseSet = new Set(await listFiles(params.baseDir, globs));
  const modeMap = await lsFilesModes(params.headDir, globs);
  const entries = [];
  const unreadable = [];
  for (const rel of headFiles.sort()) {
    const hashed = await hashFile(params.headDir, rel);
    if (!hashed) {
      unreadable.push(rel);
      continue;
    }
    entries.push({ path: rel, ...hashed, mode: modeMap.get(rel), presentInBase: baseSet.has(rel) });
  }
  if (unreadable.length > 0) {
    const { ProofixError: ProofixError2 } = await Promise.resolve().then(() => (init_types(), types_exports));
    throw new ProofixError2(`cannot hash oracle file(s): ${unreadable.join(", ")}`, "io");
  }
  return {
    version: 1,
    frozenAt: (/* @__PURE__ */ new Date()).toISOString(),
    testCommand: params.testCommand,
    setupCommand: params.setupCommand,
    regressionCommand: params.regressionCommand,
    files: entries,
    digest: combinedDigest(entries)
  };
}
async function checkOracle(dir, manifest, extraGlobs = []) {
  const modified = [];
  const removed = [];
  for (const entry of manifest.files) {
    const hashed = await hashFile(dir, entry.path);
    if (!hashed) {
      removed.push(entry.path);
    } else if (hashed.sha256 !== entry.sha256) {
      modified.push(entry.path);
    }
  }
  const modeMap = await lsFilesModes(dir, [...DEFAULT_ORACLE_GLOBS, ...extraGlobs]);
  for (const entry of manifest.files) {
    const currentMode = modeMap.get(entry.path);
    if (currentMode !== void 0 && entry.mode !== void 0 && currentMode !== entry.mode) {
      if (!modified.includes(entry.path))
        modified.push(`${entry.path} (mode ${entry.mode}\u2192${currentMode})`);
    }
  }
  const manifestSet = new Set(manifest.files.map((f) => f.path));
  const current = await listFiles(dir, [...DEFAULT_ORACLE_GLOBS, ...extraGlobs]);
  const added = current.filter((p) => !manifestSet.has(p));
  return {
    intact: modified.length === 0 && removed.length === 0 && added.length === 0,
    modified,
    removed,
    added
  };
}
async function transplantOracle(srcDir, dstDir, manifest) {
  for (const entry of manifest.files) {
    const src = path2.join(srcDir, entry.path);
    const dst = path2.join(dstDir, entry.path);
    await fs2.mkdir(path2.dirname(dst), { recursive: true });
    await fs2.copyFile(src, dst);
  }
}

// ../core/dist/runner.js
import { spawn } from "node:child_process";
import path3 from "node:path";
var MAX_CAPTURE = 512 * 1024;
var SENSITIVE_ENV = /token|secret|password|passwd|api[-_]?key|private[-_]?key|access[-_]?key|credential|bearer|cookie|session[-_]?id|conn(ection)?[-_]?str|database[-_]?url|db[-_]?url|(^|_)auth(_|$)/i;
function scrubEnv(extraAllowed = []) {
  const allow = new Set(extraAllowed.map((s) => s.toUpperCase()));
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === void 0)
      continue;
    if (SENSITIVE_ENV.test(k) && !allow.has(k.toUpperCase()))
      continue;
    env[k] = v;
  }
  env["GIT_TERMINAL_PROMPT"] = "0";
  env["CI"] = env["CI"] ?? "true";
  return env;
}
function tail(s, max = MAX_CAPTURE) {
  return Buffer.byteLength(s, "utf8") <= max ? s : s.slice(-max);
}
function runCommand(params) {
  const { command, cwd, timeoutMs } = params;
  const started = Date.now();
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = spawn(command, {
      cwd: path3.resolve(cwd),
      shell: isWin ? "cmd.exe" : "/bin/sh",
      env: params.env ?? scrubEnv(),
      windowsHide: true,
      // POSIX: make the child a process-group leader so the timeout can kill
      // the whole group (-pid), not just the shell wrapper.
      detached: !isWin
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (isWin) {
        try {
          spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
          }
        }
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
          }
        }
      }
    }, timeoutMs);
    const finish = (exitCode, spawnError) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        exitCode,
        timedOut,
        stdout: tail(stdout),
        stderr: tail(stderr),
        durationMs: Date.now() - started,
        spawnError
      });
    };
    child.stdout?.on("data", (d) => {
      const s = d.toString();
      stdout = tail(stdout + s);
      params.onData?.(s, "stdout");
    });
    child.stderr?.on("data", (d) => {
      const s = d.toString();
      stderr = tail(stderr + s);
      params.onData?.(s, "stderr");
    });
    child.on("error", (err) => finish(null, err.message));
    child.on("close", (code2) => finish(code2));
  });
}
function classify(result) {
  if (result.spawnError !== void 0)
    return "error";
  if (result.timedOut)
    return "timeout";
  return result.exitCode === 0 ? "pass" : "fail";
}
function looksEnvironmental(result) {
  const hay = result.stderr.toLowerCase();
  return /command not found|is not recognized|enoent|econnrefused|econnreset|etimedout|network|eai_again|enotfound/.test(hay) || /cannot find module|modulenotfounderror|no such file or directory/.test(hay) || /permission denied|eacces|eperm/.test(hay);
}
function stageOf(result, note) {
  return { outcome: classify(result), command: result, note };
}

// ../core/dist/verify.js
init_types();

// ../core/dist/html.js
function esc(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function code(s, cls = "") {
  return `<pre class="code ${cls}">${esc(s)}</pre>`;
}
var VERDICT_COLOR = {
  VERIFIED: "#15803d",
  FAILED: "#b91c1c",
  INCONCLUSIVE: "#a16207",
  ERROR: "#6d28d9",
  NEEDS_REVIEW: "#c2410c"
};
function stageBlock(title, expectation, stage) {
  if (!stage) {
    return `<section class="stage skipped"><h3>${esc(title)} <span class="expect">${esc(expectation)}</span></h3><p class="muted">not executed</p></section>`;
  }
  const badge = stage.outcome.toUpperCase();
  const badgeCls = stage.outcome === "pass" ? "pass" : stage.outcome === "fail" ? "fail" : "err";
  const dur = (stage.command.durationMs / 1e3).toFixed(1);
  const out = [stage.command.stdout, stage.command.stderr].filter(Boolean).join("\n");
  return `<section class="stage">
<h3>${esc(title)} <span class="expect">${esc(expectation)}</span> <span class="badge ${badgeCls}">${badge}</span></h3>
${stage.note ? `<p class="note">${esc(stage.note)}</p>` : ""}
<p class="muted"><code>${esc(stage.command.command)}</code> \u2014 exit ${stage.command.exitCode ?? "n/a"} in ${dur}s${stage.command.timedOut ? " (timed out)" : ""}</p>
${out ? code(out.length > 8e3 ? out.slice(0, 8e3) + "\n\u2026[truncated]" : out) : '<p class="muted">(no output)</p>'}
</section>`;
}
function renderHtmlReport(r) {
  const color = VERDICT_COLOR[r.verdict] ?? "#333";
  const m = r.oracle.manifest;
  const oracleRows = (m?.files ?? []).map((f) => `<tr><td class="mono">${esc(f.path)}</td><td class="mono small">${esc(f.sha256.slice(0, 16))}\u2026</td><td>${f.bytes}</td><td>${f.presentInBase ? "yes" : "added by fix"}</td></tr>`).join("");
  const changedRows = r.git.changedFiles.map((f) => `<li class="mono">${esc(f)}</li>`).join("");
  const reasons = r.reasons.map((s) => `<li>${esc(s)}</li>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProofFix Report \u2014 ${esc(r.verdict)}</title>
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
  <div class="brand">ProofFix \xB7 Proof Report</div>
  <div class="verdict">${esc(r.verdict)}</div>
  <div class="evidence">evidence level: <strong>${esc(r.evidence)}</strong> \xB7 generated ${esc(r.env.finishedAt)} \xB7 proofix ${esc(r.tool.version)}</div>
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
    <dt>duration</dt><dd>${(r.env.durationMs / 1e3).toFixed(1)}s</dd>
  </dl></div>
</div>

<div class="card"><h2>Why this verdict</h2><ul>${reasons}</ul></div>

<h2 class="sec">Verification stages</h2>
${stageBlock("RED \u2014 base revision", "expected: FAIL", r.stages.red)}
${stageBlock("GREEN \u2014 fixed revision", "expected: PASS", r.stages.green)}
${stageBlock(`NEGATIVE CONTROL${r.stages.control ? ` (${r.stages.control.kind})` : ""}`, "expected: FAIL", r.stages.control)}
${stageBlock("REGRESSION \u2014 fixed revision", "expected: PASS", r.stages.regression)}

<h2 class="sec">Frozen oracle</h2>
<div class="card">
${m ? `<p class="muted">test command: <code>${esc(m.testCommand)}</code>${m.setupCommand ? ` \xB7 setup: <code>${esc(m.setupCommand)}</code>` : ""}${m.regressionCommand ? ` \xB7 regression: <code>${esc(m.regressionCommand)}</code>` : ""}<br>
frozen at ${esc(m.frozenAt)} \xB7 digest <span class="mono">${esc(m.digest.slice(0, 24))}\u2026</span>` : '<p class="muted">run aborted before the oracle could be frozen</p>'}
${r.oracle.headCheck ? ` \xB7 post-run integrity: <strong>${r.oracle.headCheck.intact ? "intact" : "VIOLATED"}</strong>` : ""}</p>
${r.oracle.oracleFilesChangedByFix.length ? `<p class="note">\u26A0 the fix modified oracle files: ${r.oracle.oracleFilesChangedByFix.map(esc).join(", ")}</p>` : ""}
<table><thead><tr><th>file</th><th>sha-256</th><th>bytes</th><th>in base</th></tr></thead><tbody>${oracleRows || '<tr><td colspan="4" class="muted">no test files matched the oracle globs</td></tr>'}</tbody></table>
</div>

<h2 class="sec">Risk assessment</h2>
<div class="card">
<p><strong style="color:${r.risk.level === "high" ? "#b91c1c" : r.risk.level === "medium" ? "#a16207" : "#15803d"}">${r.risk.level.toUpperCase()}</strong> \u2014 ${esc(r.risk.gate.summary)}</p>
${r.risk.gate.checklist.length ? `<ul>${r.risk.gate.checklist.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
${r.risk.hits.length ? `<table><thead><tr><th>category</th><th>level</th><th>files</th><th>reason</th></tr></thead><tbody>${r.risk.hits.map((h) => `<tr><td>${esc(h.category)}</td><td>${esc(h.level)}</td><td class="mono small">${h.files.map(esc).join("<br>") || "\u2014"}</td><td>${esc(h.reason)}</td></tr>`).join("")}</tbody></table>` : ""}
</div>

<h2 class="sec">Changed files (base \u2192 head)</h2>
<div class="card"><ul>${changedRows || '<li class="muted">none</li>'}</ul>
${r.git.diff ? `<details><summary class="muted">diff${r.git.diffTruncated ? " (truncated)" : ""}</summary>${code(r.git.diff)}</details>` : ""}
</div>

<h2 class="sec">Reproduce</h2>
<div class="card">${code(r.reproduce)}</div>

<footer>ProofFix \u2014 "Your AI fixed the bug. Now prove it." \xB7 report ${esc(r.artifacts.json)}</footer>
</div></body></html>`;
}

// ../core/dist/risk.js
var RULES = [
  {
    category: "authentication",
    level: "high",
    reason: "authentication / session / token code",
    match: /(^|\/)(auth|login|signin|session|oauth|sso|jwt|token|passwd|password|credential)s?[\/._-]|(^|\/)auth\//i
  },
  {
    category: "authorization",
    level: "high",
    reason: "permission / ACL / role checks",
    match: /(^|\/)(rbac|acl|permission|policy|role|authorize|access[-_]?control)s?[\/._-]/i
  },
  {
    category: "payments",
    level: "high",
    reason: "payment / billing / checkout code",
    match: /(^|\/)(payment|billing|checkout|stripe|paypal|invoice|subscription|order)s?[\/._-]/i
  },
  {
    category: "database-migration",
    level: "high",
    reason: "schema migration files",
    match: /(^|\/)(migrations?|migrate|schema\.(sql|prisma|ts|rs))\/|\.migration\.|(^|\/)migrations?\//i
  },
  {
    category: "sensitive-data",
    level: "high",
    reason: "secrets, keys, PII handling",
    match: /(^|\/|\.)(secret|secrets|\.env|env\.|private[-_]?key|\.pem$|\.key$|pii|personal[-_]?data|gdpr|ssn)/i
  },
  {
    category: "crypto",
    level: "high",
    reason: "cryptographic primitives / certificate handling",
    match: /(^|\/)(crypto|tls|ssl|certificate|cert|encrypt|decrypt|cipher|hash[-_]?password)s?[\/._-]/i
  },
  {
    category: "ci-cd",
    level: "medium",
    reason: "CI/CD pipeline configuration",
    match: /(^|\/)\.github\/workflows\/|(^|\/)\.gitlab-ci|(^|\/)jenkinsfile|(^|\/)\.circleci\/|(^|\/)azure-pipelines|(^|\/)\.travis\.yml|(^|\/)dockerfile|docker-compose/i
  },
  {
    category: "supply-chain",
    level: "medium",
    reason: "dependency manifests & lockfiles",
    match: /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pipfile\.lock|go\.mod|go\.sum|cargo\.toml|cargo\.lock|gemfile\.lock|composer\.(json|lock)|pom\.xml|build\.gradle)$/i
  },
  {
    category: "infrastructure",
    level: "medium",
    reason: "infra-as-code / deployment config",
    match: /(^|\/)(terraform|k8s|kubernetes|helm|ansible|cloudformation|pulumi)[\/._-]|\.tf$/i
  }
];
function assessRisk(changedFiles2, diff) {
  const hits = [];
  const flagged = /* @__PURE__ */ new Set();
  for (const rule of RULES) {
    const files = changedFiles2.filter((f) => rule.match.test(f) && !flagged.has(f));
    if (files.length > 0) {
      files.forEach((f) => flagged.add(f));
      hits.push({ category: rule.category, level: rule.level, files, reason: rule.reason });
    }
  }
  if (diff) {
    const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const suspicious = added.filter((l) => /(api[-_]?key|secret|password|private[-_]?key)\s*[:=]/i.test(l));
    if (suspicious.length > 0 && !hits.some((h) => h.category === "sensitive-data")) {
      hits.push({
        category: "sensitive-data",
        level: "high",
        files: [],
        reason: `diff adds ${suspicious.length} line(s) that look like embedded credentials`
      });
    }
  }
  const level = hits.some((h) => h.level === "high") ? "high" : hits.some((h) => h.level === "medium") ? "medium" : "low";
  const checklist = [];
  if (level === "high") {
    checklist.push("manual security review required before merge");
    for (const h of hits.filter((h2) => h2.level === "high")) {
      checklist.push(`${h.category}: verify ${h.files.length > 0 ? h.files.join(", ") : "flagged diff lines"} \u2014 ${h.reason}`);
    }
  } else if (level === "medium") {
    checklist.push("review recommended: deployment or dependency surface changed");
    for (const h of hits)
      checklist.push(`${h.category}: ${h.reason}`);
  }
  return {
    level,
    hits,
    unflagged: changedFiles2.filter((f) => !flagged.has(f)),
    gate: {
      autoApprovable: level === "low",
      summary: level === "high" ? `HIGH RISK \u2014 this fix touches ${hits.map((h) => h.category).join(", ")}. Proof evidence is attached, but merge/deploy requires human review; do not auto-approve.` : level === "medium" ? "MEDIUM RISK \u2014 the fix touches deployment/dependency surfaces. Review recommended before merge." : "low risk \u2014 no sensitive surfaces detected.",
      checklist
    }
  };
}

// ../core/dist/verify.js
var PROOFIX_VERSION = "0.1.0";
var DEFAULT_TIMEOUT_MS = 10 * 60 * 1e3;
async function prepareDirs(stateDir) {
  const runId = `${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
  const workDir = path4.join(stateDir, "worktrees");
  const reportDir = path4.join(stateDir, "reports", runId);
  await fs3.mkdir(workDir, { recursive: true });
  await fs3.mkdir(reportDir, { recursive: true });
  return {
    stateDir,
    workDir,
    reportDir,
    baseWt: path4.join(workDir, `${runId}-base`),
    headWt: path4.join(workDir, `${runId}-head`)
  };
}
function reproduceCommand(opts) {
  const parts = ["proofix verify", `--base ${opts.base}`, `--head ${opts.head}`, `--test ${JSON.stringify(opts.test)}`];
  if (opts.setup)
    parts.push(`--setup ${JSON.stringify(opts.setup)}`);
  if (opts.regression)
    parts.push(`--regression ${JSON.stringify(opts.regression)}`);
  for (const g of opts.freeze ?? [])
    parts.push(`--freeze ${JSON.stringify(g)}`);
  return parts.join(" \\\n  ");
}
async function verify(options) {
  const log = options.onProgress ?? (() => {
  });
  const startedAt = /* @__PURE__ */ new Date();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const root = await repoRoot(options.repo);
  log(`repo: ${root}`);
  const base = await resolveRev(root, options.base);
  const head = await resolveRev(root, options.head);
  if (base.sha === head.sha) {
    throw new ProofixError(`base and head resolve to the same commit (${base.sha.slice(0, 10)})`, "bad-revision");
  }
  log(`base: ${base.sha.slice(0, 10)} "${base.subject}"`);
  log(`head: ${head.sha.slice(0, 10)} "${head.subject}"`);
  const stateDir = options.stateDir ?? path4.join(root, ".proofix");
  const dirs = await prepareDirs(stateDir);
  const env = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    git: await gitVersion(),
    cwd: root,
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    durationMs: 0
  };
  const files = await changedFiles(root, base.sha, head.sha);
  const { diff, truncated: diffTruncated } = await diffBetween(root, base.sha, head.sha);
  const { git: gitRun } = await Promise.resolve().then(() => (init_git(), git_exports));
  const ancestor = await gitRun(["merge-base", "--is-ancestor", base.sha, head.sha], { cwd: root, allowFail: true });
  const ancestorOk = ancestor.code === 0;
  const gitCtx = {
    repoRoot: root,
    baseRef: options.base,
    headRef: options.head,
    baseSha: base.sha,
    headSha: head.sha,
    baseSubject: base.subject,
    headSubject: head.subject,
    changedFiles: files,
    diff,
    diffTruncated
  };
  const reasons = [];
  if (!ancestorOk) {
    reasons.push("warning: head is not a descendant of base \u2014 the fix revision may not be based on the buggy revision; evidence strength is questionable");
  }
  const stages = { red: null, green: null, control: null, regression: null };
  let manifest = null;
  let headCheck = null;
  let oracleFilesChangedByFix = [];
  let rebaselined = null;
  let verdict = "ERROR";
  let evidence = "none";
  const finish = async () => {
    env.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    env.durationMs = Date.now() - startedAt.getTime();
    if (rebaselined && verdict === "VERIFIED") {
      verdict = "NEEDS_REVIEW";
      reasons.push("verdict downgraded: the oracle was re-baselined in this run");
    }
    const risk = assessRisk(files, diff);
    if (risk.level === "high" && verdict === "VERIFIED") {
      verdict = "NEEDS_REVIEW";
      reasons.push("high-risk surface detected \u2014 evidence attached, but human review is required before merge");
    } else if (risk.level !== "low") {
      reasons.push(`risk: ${risk.gate.summary}`);
    }
    const report = {
      schema: "proofix.report/v1",
      tool: { name: "proofix", version: PROOFIX_VERSION },
      verdict,
      evidence,
      reasons,
      env,
      git: gitCtx,
      risk,
      oracle: {
        manifest,
        headCheck,
        oracleFilesChangedByFix,
        rebaselined
      },
      stages,
      reproduce: reproduceCommand(options),
      artifacts: { json: "", html: "", logDir: dirs.reportDir }
    };
    const jsonPath = path4.join(dirs.reportDir, "report.json");
    const htmlPath = path4.join(dirs.reportDir, "report.html");
    report.artifacts.json = jsonPath;
    report.artifacts.html = htmlPath;
    await fs3.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    await fs3.writeFile(htmlPath, renderHtmlReport(report), "utf8");
    const latest = path4.join(stateDir, "reports", "latest.json");
    await fs3.writeFile(latest, JSON.stringify({ report: jsonPath, html: htmlPath, verdict }, null, 2), "utf8");
    return report;
  };
  const env_ = scrubEnv(options.passEnv);
  if (options.passEnv && options.passEnv.length > 0) {
    reasons.push(`note: ${options.passEnv.length} env var(s) explicitly allowed into test subprocesses: ${options.passEnv.join(", ")}`);
  }
  const runStage = async (cwd, command) => stageOf(await runCommand({ command, cwd, timeoutMs, env: env_ }));
  try {
    log("creating isolated worktrees\u2026");
    await addWorktree(root, dirs.baseWt, base.sha);
    await addWorktree(root, dirs.headWt, head.sha);
    manifest = await freezeOracle({
      headDir: dirs.headWt,
      baseDir: dirs.baseWt,
      testCommand: options.test,
      setupCommand: options.setup,
      regressionCommand: options.regression,
      extraGlobs: options.freeze
    });
    log(`oracle frozen: ${manifest.files.length} test file(s), digest ${manifest.digest.slice(0, 12)}\u2026`);
    {
      const oraclePath = path4.join(stateDir, "oracle.json");
      const historyPath = path4.join(stateDir, "oracle-history.jsonl");
      let previous = null;
      try {
        previous = JSON.parse(await fs3.readFile(oraclePath, "utf8"));
      } catch {
      }
      if (previous?.digest && previous.digest !== manifest.digest) {
        rebaselined = {
          previousDigest: previous.digest,
          previousFrozenAt: previous.frozenAt ?? "unknown"
        };
        reasons.push(`oracle re-baselined: test surface changed since the previous baseline (${previous.digest.slice(0, 12)}\u2026 @ ${previous.frozenAt ?? "unknown"} \u2192 ${manifest.digest.slice(0, 12)}\u2026) \u2014 requires human acknowledgment`);
      }
      const audit = {
        event: "oracle-freeze",
        at: manifest.frozenAt,
        headSha: head.sha,
        baseSha: base.sha,
        digest: manifest.digest,
        fileCount: manifest.files.length,
        testCommand: manifest.testCommand,
        rebaselineOf: previous?.digest ?? null
      };
      await fs3.writeFile(oraclePath, JSON.stringify(manifest, null, 2), "utf8");
      await fs3.appendFile(historyPath, JSON.stringify(audit) + "\n", "utf8");
    }
    oracleFilesChangedByFix = manifest.files.map((f) => f.path).filter((p) => files.includes(p));
    if (oracleFilesChangedByFix.length > 0 && !options.allowTestChanges) {
      reasons.push(`the candidate fix modifies oracle files: ${oracleFilesChangedByFix.join(", ")} \u2014 the fix changed the tests it must pass`);
    }
    if (options.setup) {
      log(`setup in base worktree: ${options.setup}`);
      const setupBase = await runStage(dirs.baseWt, options.setup);
      if (setupBase.outcome !== "pass") {
        reasons.push(`setup failed in base worktree (exit ${setupBase.command.exitCode})`);
        stages.red = { ...setupBase, note: "setup failed \u2014 environmental, not a test result" };
        verdict = "ERROR";
        return await finish();
      }
      log(`setup in head worktree: ${options.setup}`);
      const setupHead = await runStage(dirs.headWt, options.setup);
      if (setupHead.outcome !== "pass") {
        reasons.push(`setup failed in head worktree (exit ${setupHead.command.exitCode})`);
        stages.green = { ...setupHead, note: "setup failed \u2014 environmental, not a test result" };
        verdict = "ERROR";
        return await finish();
      }
    }
    log(`RED: running oracle on base (${options.test})`);
    const red = await runStage(dirs.baseWt, options.test);
    if (red.outcome === "timeout" || red.outcome === "error") {
      stages.red = { ...red, note: "acceptance command could not run on the base revision" };
      reasons.push(`acceptance command errored on base: ${red.command.spawnError ?? "timeout"}`);
      verdict = "ERROR";
      return await finish();
    }
    if (red.outcome === "pass") {
      stages.red = { ...red, note: "acceptance tests already pass on the base \u2014 the bug is not reproducible here" };
      reasons.push("the acceptance tests PASS on the buggy base revision \u2014 the reported bug cannot be reproduced with this oracle");
      verdict = "INCONCLUSIVE";
      return await finish();
    }
    if (looksEnvironmental(red.command)) {
      stages.red = { ...red, note: "failure looks environmental (missing tools/network), not a code bug" };
      reasons.push("the base run failed for what looks like environmental reasons, not the reported bug");
      verdict = "ERROR";
      return await finish();
    }
    stages.red = { ...red, note: "bug reproduced on base" };
    log("RED confirmed: bug reproduced on base");
    log(`GREEN: running oracle on head (${options.test})`);
    const green = await runStage(dirs.headWt, options.test);
    stages.green = green;
    if (green.outcome === "timeout" || green.outcome === "error") {
      stages.green = { ...green, note: "acceptance command could not run on the head revision" };
      reasons.push("acceptance command errored on head \u2014 cannot judge the fix");
      verdict = "ERROR";
      return await finish();
    }
    if (green.outcome === "fail") {
      stages.green = { ...green, note: "fix does not satisfy the frozen oracle" };
      reasons.push("the acceptance tests still FAIL on the fixed revision");
      verdict = "FAILED";
      evidence = "high";
      return await finish();
    }
    log("GREEN confirmed: head passes the oracle");
    headCheck = await checkOracle(dirs.headWt, manifest, options.freeze);
    if (!headCheck.intact) {
      const parts = [];
      if (headCheck.modified.length)
        parts.push(`modified: ${headCheck.modified.join(", ")}`);
      if (headCheck.removed.length)
        parts.push(`removed: ${headCheck.removed.join(", ")}`);
      if (headCheck.added.length)
        parts.push(`added: ${headCheck.added.join(", ")}`);
      reasons.push(`oracle files changed during the run \u2014 ${parts.join("; ")}`);
      verdict = "FAILED";
      evidence = "high";
      return await finish();
    }
    if (oracleFilesChangedByFix.length > 0 && !options.allowTestChanges) {
      verdict = "NEEDS_REVIEW";
      evidence = "low";
      reasons.push("verdict requires human review: the fix modified its own acceptance tests");
      return await finish();
    }
    if (options.negativeControl !== false) {
      const missingInBase = manifest.files.filter((f) => !f.presentInBase);
      if (missingInBase.length === 0) {
        const runs = Math.max(1, options.controlRuns ?? 1);
        log(`CONTROL: re-running frozen oracle on base (baseline-rerun \xD7${runs})`);
        const ctl = await runStage(dirs.baseWt, options.test);
        stages.control = { ...ctl, kind: "baseline-rerun" };
        if (ctl.outcome === "pass") {
          reasons.push("negative control failed: the base now passes the oracle \u2014 the test may be flaky or environment-dependent");
          verdict = "INCONCLUSIVE";
          evidence = "low";
          return await finish();
        }
        if (ctl.outcome === "error" || ctl.outcome === "timeout") {
          reasons.push("negative control could not be re-run; confidence reduced");
          evidence = "medium";
        } else {
          for (let i = 1; i < runs; i++) {
            const extra = await runStage(dirs.baseWt, options.test);
            if (extra.outcome === "pass") {
              reasons.push(`negative control failed on re-run ${i + 1}: the base passed the oracle \u2014 flaky or environment-dependent`);
              verdict = "INCONCLUSIVE";
              evidence = "low";
              return await finish();
            }
          }
          reasons.push(`negative control: base fails the frozen oracle ${runs}\xD7 \u2014 the failure is stable`);
          evidence = "high";
        }
      } else {
        log(`CONTROL: transplanting ${missingInBase.length} oracle file(s) onto base`);
        await transplantOracle(dirs.headWt, dirs.baseWt, manifest);
        const ctl = await runStage(dirs.baseWt, options.test);
        stages.control = { ...ctl, kind: "oracle-on-base" };
        if (ctl.outcome === "pass") {
          reasons.push("the new acceptance tests PASS even without the fix \u2014 they do not detect the bug (vacuous tests)");
          verdict = "INCONCLUSIVE";
          evidence = "low";
          return await finish();
        }
        if (ctl.outcome === "error" || ctl.outcome === "timeout") {
          reasons.push("negative control could not execute on base code; confidence reduced");
          evidence = "medium";
        } else if (looksEnvironmental(ctl.command)) {
          reasons.push("negative control inconclusive: the transplanted oracle fails on base for what looks like environmental reasons (missing dependency/fixture), not necessarily the bug \u2014 confidence reduced");
          evidence = "medium";
        } else {
          reasons.push("negative control: the fix-added oracle fails on base code \u2014 it genuinely detects the bug");
          evidence = "high";
        }
      }
    } else {
      reasons.push("negative control disabled by configuration; confidence reduced");
      evidence = "medium";
    }
    if (options.regression) {
      log(`REGRESSION: ${options.regression}`);
      const reg = await runStage(dirs.headWt, options.regression);
      stages.regression = reg;
      if (reg.outcome === "fail") {
        reasons.push("the fix passes the oracle but breaks other tests (regression detected)");
        verdict = "FAILED";
        return await finish();
      }
      if (reg.outcome === "error" || reg.outcome === "timeout") {
        reasons.push("regression suite could not complete; fix is verified for the target bug only");
        evidence = evidence === "high" ? "medium" : evidence;
      } else {
        reasons.push("regression suite passes on the fixed revision");
      }
    } else {
      reasons.push("no regression command provided; only the oracle was checked");
      if (evidence === "high")
        evidence = "medium";
    }
    verdict = "VERIFIED";
    reasons.unshift("the frozen oracle fails on the base revision and passes on the fixed revision");
    return await finish();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reasons.push(`verification aborted: ${msg}`);
    verdict = "ERROR";
    const report = await finish();
    if (err instanceof ProofixError)
      throw Object.assign(err, { report });
    return report;
  } finally {
    if (!options.keepWorktrees) {
      await removeWorktree(root, dirs.baseWt).catch(() => {
      });
      await removeWorktree(root, dirs.headWt).catch(() => {
      });
      const { git: git2 } = await Promise.resolve().then(() => (init_git(), git_exports));
      await git2(["worktree", "prune"], { cwd: root, allowFail: true });
    }
  }
}

// ../core/dist/demo.js
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
var execFileP2 = promisify2(execFile2);

// ../core/dist/index.js
init_types();

// src/index.ts
import fs4 from "node:fs/promises";
import path5 from "node:path";
var name = "proofix";
var inject = ["tools", "systemPrompt"];
var Config = z.object({
  timeoutMs: z.number().min(1e4).max(30 * 6e4).default(10 * 6e4),
  keepWorktrees: z.boolean().default(false),
  allowTestChanges: z.boolean().default(false)
});
var REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", required: true },
    evidence: { type: "string", required: true },
    reasons: { type: "array", required: true, items: { type: "string" } },
    html: { type: "string", required: true },
    json: { type: "string", required: true },
    reproduce: { type: "string", required: true }
  }
};
function apply(ctx, config) {
  ctx.systemPrompt.section({
    name: "tool:proofix",
    order: 2950,
    text: "When you claim a bug is fixed, back it with proofix_verify: it runs the frozen acceptance tests in isolated worktrees \u2014 base must FAIL, the fix must PASS, plus a negative control. Never assert a fix works without this evidence; if it returns FAILED/INCONCLUSIVE, fix again or say so honestly. The verdict is computed by an independent engine \u2014 you cannot influence it. For a bug you are actively fixing, prefer proofix_autofix: it runs the same verification and returns a structured next action (fix-again / restore-tests / refine-oracle / hand-off), capped at 3 rounds \u2014 when the budget is exhausted, hand the report to the human."
  });
  ctx.tools.register(
    defineTool({
      name: "proofix_verify",
      description: "Independently verify that the current changes fix a bug: runs the acceptance test in an isolated worktree of the base revision (must FAIL), in the candidate revision (must PASS), plus a negative control and optional regression suite. Zero LLM involvement \u2014 verdict comes from real test execution.",
      parameters: {
        base: { type: "string", required: true, description: 'Git revision that contains the bug (e.g. "HEAD~1" or a sha).' },
        head: { type: "string", description: "Git revision claiming the fix (default HEAD)." },
        test: { type: "string", required: true, description: 'Acceptance test command, e.g. "pnpm test" or "node test/x.test.js".' },
        setup: { type: "string", description: 'Setup command run once per worktree (e.g. "pnpm install --frozen-lockfile").' },
        regression: { type: "string", description: "Regression command run on the fixed revision." },
        repo: { type: "string", description: "Repository path (default: session working directory)." }
      },
      output: {
        schema: REPORT_SCHEMA,
        render: (_args, value) => [{ type: "text", text: `${value.verdict} (${value.evidence})
${value.reasons.join("\n")}
report: ${value.html}` }]
      },
      async execute(args, exec) {
        const report = await verify({
          repo: args.repo ?? process.cwd(),
          base: args.base,
          head: args.head ?? "HEAD",
          test: args.test,
          setup: args.setup,
          regression: args.regression,
          timeoutMs: config.timeoutMs,
          keepWorktrees: config.keepWorktrees,
          allowTestChanges: config.allowTestChanges
        });
        return {
          verdict: report.verdict,
          evidence: report.evidence,
          reasons: report.reasons,
          html: report.artifacts.html,
          json: report.artifacts.json,
          reproduce: report.reproduce
        };
      },
      presentCall: (args) => ({ card: "generic", title: `ProofFix verify ${args.base} \u2192 ${args.head ?? "HEAD"}`, kind: "execute", rawInput: args.test })
    })
  );
  ctx.tools.register(
    defineTool({
      name: "proofix_report",
      description: "Locate the most recent ProofFix report (JSON + HTML) for this repository.",
      parameters: {
        repo: { type: "string", description: "Repository path (default: session working directory)." }
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            verdict: { type: "string", required: true },
            html: { type: "string", required: true },
            json: { type: "string", required: true }
          }
        },
        render: (_a, v) => [{ type: "text", text: `${v.verdict} \u2014 ${v.html}` }]
      },
      async execute(args) {
        const repo = path5.resolve(args.repo ?? process.cwd());
        const latest = JSON.parse(await fs4.readFile(path5.join(repo, ".proofix", "reports", "latest.json"), "utf8"));
        return { verdict: latest.verdict, html: latest.html, json: latest.report };
      },
      presentCall: () => ({ card: "generic", title: "ProofFix latest report", kind: "read" })
    })
  );
  const MAX_ROUNDS = 3;
  const attempts = /* @__PURE__ */ new Map();
  function failureFeedback(report) {
    const r = report;
    if (r.verdict === "VERIFIED") {
      return { kind: "verified", action: "stop", details: "fix verified \u2014 attach the report and stop editing" };
    }
    if (r.verdict === "NEEDS_REVIEW") {
      return { kind: "needs-review", action: "hand-off", details: r.risk.level === "high" ? "high-risk surface: give the human the report; do not merge" : "the fix touched its own acceptance tests: restore them and fix the code instead" };
    }
    if (r.stages.red?.outcome === "pass") {
      return { kind: "not-reproducible", action: "refine-oracle", details: "the bug does not reproduce on the base \u2014 the acceptance test or bug description is wrong; ask the human or strengthen the oracle" };
    }
    if (r.oracle.headCheck && !r.oracle.headCheck.intact) {
      const c = r.oracle.headCheck;
      return { kind: "oracle-tampered", action: "restore-tests", details: `test files were modified (${[...c.modified, ...c.removed].join(", ")}) \u2014 restore the frozen tests and fix the code` };
    }
    if (r.stages.green?.outcome === "fail") {
      const tail2 = (r.stages.green.command.stderr || r.stages.green.command.stdout).split("\n").slice(-15).join("\n");
      return { kind: "fix-insufficient", action: "fix-again", details: `acceptance still fails on the fix:
${tail2}` };
    }
    if (r.stages.regression?.outcome === "fail") {
      return { kind: "regression", action: "fix-again", details: "the target bug is fixed but the regression suite now fails \u2014 rework the fix" };
    }
    if (r.stages.control?.outcome === "pass") {
      return { kind: "vacuous-oracle", action: "refine-oracle", details: "the oracle passes even without the fix \u2014 write a test that actually detects the bug" };
    }
    if (r.verdict === "INCONCLUSIVE") {
      return { kind: "inconclusive", action: "hand-off", details: r.reasons.join("; ") };
    }
    return { kind: "environment-error", action: "fix-environment", details: r.reasons.join("; ") };
  }
  ctx.tools.register(
    defineTool({
      name: "proofix_autofix",
      description: "Bounded verify-and-feedback loop for a bug fix you just made: runs the independent ProofFix engine and returns a verdict plus structured next action. Maximum 3 attempts per (repo, base, test) per session \u2014 after that the loop stops and hands off to the human. The verdict and the round counter are computed by this engine; you cannot influence either.",
      parameters: {
        bug: { type: "string", required: true, description: "Bug description being fixed (for the audit trail)." },
        base: { type: "string", required: true, description: "Git revision containing the bug." },
        head: { type: "string", description: "Candidate fix revision (default HEAD \u2014 commit your fix first)." },
        test: { type: "string", required: true, description: "Acceptance test command." },
        setup: { type: "string", description: "Setup command run once per worktree." },
        regression: { type: "string", description: "Regression command run on the fixed revision." },
        repo: { type: "string", description: "Repository path (default: session working directory)." }
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            verdict: { type: "string", required: true },
            evidence: { type: "string", required: true },
            round: { type: "integer", required: true },
            attemptsLeft: { type: "integer", required: true },
            feedback: {
              type: "object",
              required: true,
              additionalProperties: false,
              properties: {
                kind: { type: "string", required: true },
                action: { type: "string", required: true, enum: ["stop", "fix-again", "restore-tests", "refine-oracle", "fix-environment", "hand-off"] },
                details: { type: "string", required: true }
              }
            },
            html: { type: "string", required: true }
          }
        },
        render: (_a, v) => [
          {
            type: "text",
            text: `${v.verdict} (${v.evidence}) \u2014 round ${v.round}, ${v.attemptsLeft} attempt(s) left
[${v.feedback.kind}] ${v.feedback.action}: ${v.feedback.details}`
          }
        ]
      },
      async execute(args) {
        const repo = path5.resolve(args.repo ?? process.cwd());
        const key = `${repo}::${args.base}::${args.test}`;
        const round = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, round);
        if (round > MAX_ROUNDS) {
          const feedback = {
            kind: "budget-exhausted",
            action: "hand-off",
            details: `proofix_autofix budget exhausted (${MAX_ROUNDS} rounds) \u2014 hand the latest report to the human instead of retrying`
          };
          return {
            verdict: "NEEDS_REVIEW",
            evidence: "none",
            round,
            attemptsLeft: 0,
            feedback,
            html: ""
          };
        }
        const report = await verify({
          repo,
          base: args.base,
          head: args.head ?? "HEAD",
          test: args.test,
          setup: args.setup,
          regression: args.regression,
          timeoutMs: config.timeoutMs,
          keepWorktrees: config.keepWorktrees,
          allowTestChanges: config.allowTestChanges
        });
        const fb = failureFeedback(report);
        return {
          verdict: report.verdict,
          evidence: report.evidence,
          round,
          attemptsLeft: Math.max(0, MAX_ROUNDS - round),
          feedback: fb,
          html: report.artifacts.html
        };
      },
      presentCall: (args) => ({ card: "generic", title: `ProofFix autofix round (${args.base} \u2192 ${args.head ?? "HEAD"})`, kind: "execute", rawInput: args.bug })
    })
  );
}
export {
  Config,
  apply,
  inject,
  name
};

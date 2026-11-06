#!/usr/bin/env node
/**
 * Regenerate docs/assets/demo-report.png from a fresh `proofix demo` run.
 * Uses the system Edge/Chrome headless mode — no extra dependencies.
 *
 *   node scripts/screenshot.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'docs', 'assets');
await fs.mkdir(assets, { recursive: true });

// 1. run the demo to produce a fresh report
const bin = path.join(root, 'packages', 'cli', 'dist', 'bin.js');
let out = '';
try {
  const r = await execFileP('node', [bin, 'demo'], { cwd: root });
  out = r.stdout + r.stderr;
} catch (e) {
  out = (e.stdout ?? '') + (e.stderr ?? '');
}
const m = out.match(/report: (\S+report\.html)/);
if (!m) throw new Error('could not locate demo report path');
const reportHtml = m[1].replace(/\x1b\[[0-9;]*m/g, '');

// 2. copy the report next to the screenshot for browsing
await fs.copyFile(reportHtml, path.join(assets, 'demo-report.html'));

// 3. headless screenshot via system browser
const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error('no headless browser found (tried Edge/Chrome/Chromium)');

const png = path.join(assets, 'demo-report.png');
await execFileP(browser, [
  '--headless', '--disable-gpu', '--window-size=1100,2400',
  `--screenshot=${png}`, `file:///${reportHtml.replace(/\\/g, '/')}`,
]);
console.log(`screenshot → ${png}`);

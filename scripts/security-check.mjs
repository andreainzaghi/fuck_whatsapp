#!/usr/bin/env node
/**
 * security-check.mjs — post-test security scanner.
 *
 * 1. CANARY SCAN: after tests/e2e/canary has sent the canary message between
 *    two real profiles, this scanner asserts the canary plaintext appears
 *    NOWHERE outside the encrypted SimpleX databases: not in source, not in
 *    logs, not in temp files, not in staging, not in the (encrypted) db bytes.
 * 2. DEPENDENCY AUDIT: npm audit (high+), lockfile presence.
 * 3. SOURCE TRIPWIRES: no localStorage/sessionStorage writes of chat data, no
 *    remote URLs in frontend source, no wildcard CORS in the bridge.
 *
 * The canary is assembled from parts so this file itself never contains it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const CANARY = ['FWA_SUPER', 'SECRET', 'CANARY', '928471'].join('_');

let failures = 0;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  failures += 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

/* ---------------- 1. canary scan ---------------- */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'playwright-report', 'test-results']);
const scanned = [];

function* walk(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(p);
    } else if (e.isFile()) {
      yield p;
    }
  }
}

function fileContainsCanary(p) {
  const size = statSync(p).size;
  if (size > 512 * 1024 * 1024) return false;
  const buf = readFileSync(p);
  return buf.includes(CANARY);
}

let canaryHits = 0;
for (const p of walk(repoRoot)) {
  scanned.push(p);
  if (fileContainsCanary(p)) {
    // The encrypted SimpleX databases must NOT contain the plaintext either —
    // if they did, encryption would be broken, so a hit is a failure anywhere.
    fail(`canary plaintext found in: ${path.relative(repoRoot, p)}`);
    canaryHits += 1;
  }
}
if (canaryHits === 0) ok(`canary absent from all ${scanned.length} files scanned (source, runtime, dbs, logs, temp)`);

/* ---------------- 2. dependency audit ---------------- */
if (!existsSync(path.join(repoRoot, 'package-lock.json'))) fail('package-lock.json missing — dependencies are not locked');
else ok('lockfile present');

try {
  execFileSync('npm', ['audit', '--audit-level=high', '--omit=dev'], { cwd: repoRoot, stdio: 'pipe' });
  ok('npm audit: no high/critical vulnerabilities in production deps');
} catch (err) {
  const out = err.stdout?.toString() ?? '';
  fail(`npm audit reported issues:\n${out.slice(0, 2000)}`);
}

/* ---------------- 3. source tripwires ---------------- */
const webSrc = path.join(repoRoot, 'apps', 'web', 'src');
const tripwires = [
  { re: /localStorage\.setItem|sessionStorage\.setItem/, why: 'web storage writes are forbidden (UI prefs go to IndexedDB, chat data nowhere)' },
  { re: /https?:\/\/(www\.)?(google|gstatic|googleapis|facebook|meta|fbcdn|amazonaws|cloudfront|firebase|sentry|segment|amplitude|cdn\.)/i, why: 'remote service URL in frontend source' },
];
let tripped = 0;
if (existsSync(webSrc)) {
  for (const p of walk(webSrc)) {
    if (!/\.(ts|tsx|css|html)$/.test(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const t of tripwires) {
      if (t.re.test(text)) {
        fail(`${t.why}: ${path.relative(repoRoot, p)}`);
        tripped += 1;
      }
    }
  }
  if (tripped === 0) ok('no web-storage writes, no remote service URLs in frontend source');
}

const bridgeSrc = path.join(repoRoot, 'packages', 'simplex-bridge', 'src');
if (existsSync(bridgeSrc)) {
  let wildcard = false;
  for (const p of walk(bridgeSrc)) {
    if (/Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*/.test(readFileSync(p, 'utf8'))) wildcard = true;
  }
  wildcard ? fail('wildcard CORS found in bridge') : ok('no wildcard CORS in bridge');
}

console.log(failures === 0 ? '\nSECURITY CHECK: PASS' : `\nSECURITY CHECK: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

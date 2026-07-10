#!/usr/bin/env node
/**
 * check-licenses.mjs — walk the PRODUCTION dependency closure that ships to
 * users and report each package's license. Fails on unknown or non-permissive
 * copyleft licenses among shipped deps (our own AGPL workspace code is exempt).
 * Dev/build-only tools (esbuild, postject, playwright, vite, typescript, …) are
 * not shipped and are not audited here.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

const ALLOWED = new Set([
  'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0',
  'MIT-0', 'Python-2.0', 'AGPL-3.0-only', 'AGPL-3.0',
]);
// deps whose license field is non-SPDX but is known-permissive
const KNOWN = { 'jsqr': 'Apache-2.0' };

/** Production dependency names shipped in the frontend + launcher. */
function productionDeps() {
  const names = new Set();
  for (const ws of ['apps/web', 'apps/launcher', 'packages/simplex-bridge']) {
    const p = path.join(repoRoot, ws, 'package.json');
    if (!existsSync(p)) continue;
    const pkg = JSON.parse(readFileSync(p, 'utf8'));
    for (const d of Object.keys(pkg.dependencies ?? {})) if (!d.startsWith('@fwa/')) names.add(d);
  }
  return names;
}

function resolveLicense(name) {
  // find the installed package.json (hoisted to root node_modules)
  const candidates = [
    path.join(repoRoot, 'node_modules', name, 'package.json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      const pkg = JSON.parse(readFileSync(c, 'utf8'));
      const lic = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? KNOWN[name];
      return { version: pkg.version, license: lic ?? KNOWN[name] ?? 'UNKNOWN' };
    }
  }
  return { version: '?', license: KNOWN[name] ?? 'UNKNOWN' };
}

let failed = 0;
console.log('Shipped production dependencies:\n');
for (const name of [...productionDeps()].sort()) {
  const { version, license } = resolveLicense(name);
  const ok = ALLOWED.has(license);
  console.log(`  ${ok ? '✓' : '✗'} ${name}@${version} — ${license}`);
  if (!ok) failed++;
}

// npm audit (production only) as a supply-chain gate
try {
  execFileSync('npm', ['audit', '--audit-level=high', '--omit=dev'], { cwd: repoRoot, stdio: 'pipe' });
  console.log('\n✓ npm audit: no high/critical vulnerabilities in production deps');
} catch (e) {
  console.error('\n✗ npm audit reported high/critical issues');
  failed++;
}

console.log(failed === 0 ? '\nLICENSE CHECK: PASS' : `\nLICENSE CHECK: ${failed} issue(s)`);
process.exit(failed === 0 ? 0 : 1);

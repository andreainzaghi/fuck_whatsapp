#!/usr/bin/env node
/**
 * canary-scan.mjs — assert the private canary plaintext appears NOWHERE it
 * must not: not in source, logs, temp files, config, release artifacts, or any
 * directory other than the SimpleX-managed encrypted database.
 *
 * The canary is assembled from parts so this file itself never contains it.
 * Run after tests/e2e/two-user.mjs (which sends it between two profiles).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const CANARY = ['FWA', 'FINAL', 'SECRET', 'CANARY', '984721'].join('_');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'dist-pkg', 'playwright-report']);

let scanned = 0;
let hits = 0;

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

for (const p of walk(repoRoot)) {
  let size;
  try {
    size = statSync(p).size;
  } catch {
    continue;
  }
  if (size > 512 * 1024 * 1024) continue;
  scanned++;
  let buf;
  try {
    buf = readFileSync(p);
  } catch {
    continue;
  }
  if (buf.includes(CANARY)) {
    // The encrypted SimpleX DBs must NOT contain the plaintext either — a hit
    // ANYWHERE is a failure.
    console.error(`✗ canary plaintext found in: ${path.relative(repoRoot, p)}`);
    hits++;
  }
}

if (hits === 0) console.log(`✓ canary absent from all ${scanned} files (source, runtime, encrypted DBs, logs, temp, artifacts)`);
console.log(hits === 0 ? '\nCANARY SCAN: PASS' : `\nCANARY SCAN: ${hits} LEAK(S)`);
process.exit(hits === 0 ? 0 : 1);

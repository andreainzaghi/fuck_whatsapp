#!/usr/bin/env node
/**
 * verify-simplex.mjs — re-verify the installed SimpleX core against the
 * manifest and the install-time record. Exits non-zero on any mismatch.
 * Used in `npm run setup`, in CI, and before packaging.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { coreFileName, EXPECTED_VERSION_PREFIX, hostPlatformKey, loadManifest, repoRoot, sha256File } from './simplex-common.mjs';

const manifest = loadManifest();
const key = hostPlatformKey();
const entry = manifest.platforms[key];
const binDir = path.join(repoRoot, 'runtime', 'bin');
const binPath = path.join(binDir, coreFileName());
const recordPath = path.join(binDir, 'simplex-chat.sha256');

let failed = false;
const fail = (m) => {
  console.error(`✗ ${m}`);
  failed = true;
};

if (!existsSync(binPath)) {
  fail('binary missing — run: npm run setup');
  process.exit(1);
}

const digest = sha256File(binPath);
console.log(`sha256: ${digest}`);

if (entry) {
  if (digest === entry.sha256) console.log(`✓ matches manifest for ${key} (${entry.provenance})`);
  else fail(`does NOT match the manifest sha256 for ${key}`);
} else {
  fail(`no manifest entry for this platform (${key})`);
}

if (existsSync(recordPath)) {
  const recorded = readFileSync(recordPath, 'utf8').trim().split(/\s+/)[0];
  if (recorded === digest) console.log('✓ matches install-time record');
  else fail('does NOT match the install-time record');
} else {
  fail('install-time record missing — reinstall with: npm run setup');
}

// Only execute AFTER the checksum verified.
if (!failed) {
  try {
    const banner = execFileSync(binPath, ['--version'], { timeout: 30_000 }).toString();
    if (banner.startsWith(EXPECTED_VERSION_PREFIX)) console.log(`✓ ${banner.split('\n')[0]}`);
    else fail(`unexpected version: ${banner.split('\n')[0]}`);
  } catch {
    fail('binary failed to execute (macOS test build: this is bundled openssl in the packaged app)');
  }
}

process.exit(failed ? 1 : 0);

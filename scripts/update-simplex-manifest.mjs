#!/usr/bin/env node
/**
 * update-simplex-manifest.mjs — regenerate SHA-256 values in the SimpleX
 * manifest by downloading each declared official asset and computing its digest.
 *
 * SAFETY: this NEVER changes the pinned `version` on its own and NEVER writes
 * the file without an explicit `--confirm` flag. Run it, review the printed
 * diff, then re-run with `--confirm` to persist.
 *
 *   node scripts/update-simplex-manifest.mjs               # dry-run, prints diff
 *   node scripts/update-simplex-manifest.mjs --confirm     # writes the file
 *   node scripts/update-simplex-manifest.mjs --version 6.6.0 --confirm
 *
 * Changing --version does NOT change URLs automatically — you must review that
 * the release tag/assets exist. This script only recomputes checksums for the
 * URLs already present (after you edit them for a new version).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { loadManifest, manifestPath } from './simplex-common.mjs';

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const versionIdx = args.indexOf('--version');
const newVersion = versionIdx >= 0 ? args[versionIdx + 1] : null;

const manifest = loadManifest();
if (newVersion) {
  if (!confirm) console.log(`Would set version: ${manifest.version} -> ${newVersion} (URLs are NOT auto-updated — edit them first)`);
  manifest.version = newVersion;
}

let changed = false;
for (const [key, entry] of Object.entries(manifest.platforms)) {
  process.stdout.write(`• ${key}: ${entry.url}\n`);
  const res = await fetch(entry.url, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`  ! HTTP ${res.status} — skipped`);
    continue;
  }
  const digest = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
  if (digest !== entry.sha256) {
    console.log(`  sha256: ${entry.sha256}\n       -> ${digest}  (CHANGED)`);
    entry.sha256 = digest;
    entry.provenance = entry.provenance === 'official-signed-sha256sums' ? 'official-signed-sha256sums' : 'tofu-computed';
    changed = true;
  } else {
    console.log('  sha256: unchanged');
  }
}

if (!confirm) {
  console.log('\nDry-run only. Re-run with --confirm to write vendor/simplex/simplex-manifest.json.');
  process.exit(0);
}
if (!changed && !newVersion) {
  console.log('\nNothing to write.');
  process.exit(0);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('\n✓ manifest updated. Review the diff and commit deliberately.');

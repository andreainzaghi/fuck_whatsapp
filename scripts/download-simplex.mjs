#!/usr/bin/env node
/**
 * download-simplex.mjs — download the pinned SimpleX Chat core for the HOST
 * platform from the official GitHub release, verify its SHA-256 against the
 * manifest BEFORE it is ever executed, and place it (+ its integrity manifest)
 * in runtime/bin/.
 *
 * - Downloads ONLY from the official URL in vendor/simplex/simplex-manifest.json.
 * - Aborts on any checksum mismatch; the binary is never chmod'd/executed unless
 *   verified.
 * - No `curl | sh`, no fork mirrors, no silent auto-update.
 */
import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { coreFileName, hostPlatformKey, loadManifest, repoRoot, sha256File } from './simplex-common.mjs';

const manifest = loadManifest();
const key = hostPlatformKey();
const entry = manifest.platforms[key];
if (!entry) {
  console.error(`No SimpleX binary is declared for this platform (${key}). See docs/KNOWN_LIMITATIONS.md.`);
  process.exit(1);
}
if (entry.supported === false) {
  console.error(`Platform ${key} is documented as unsupported.`);
  process.exit(1);
}

const binDir = path.join(repoRoot, 'runtime', 'bin');
mkdirSync(binDir, { recursive: true });
const outName = coreFileName();
const outPath = path.join(binDir, outName);
const tmpPath = `${outPath}.download`;

console.log(`SimpleX Chat ${manifest.version} — ${key}`);
console.log(`Source: ${entry.url}`);

const res = await fetch(entry.url, { redirect: 'follow' });
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await res.arrayBuffer());
rmSync(tmpPath, { force: true });
writeFileSync(tmpPath, bytes);

const digest = sha256File(tmpPath);
if (digest !== entry.sha256) {
  rmSync(tmpPath, { force: true });
  console.error(`✗ SHA-256 MISMATCH\n  expected ${entry.sha256}\n  actual   ${digest}\nAborting — nothing installed.`);
  process.exit(1);
}
console.log(`✓ SHA-256 verified (${entry.provenance})`);

// atomically place the verified binary + record the integrity manifest
renameSync(tmpPath, outPath);
if (process.platform !== 'win32') chmodSync(outPath, 0o755);
writeFileSync(path.join(binDir, 'simplex-chat.sha256'), `${digest}  ${entry.asset}  v${manifest.version}\n`);
console.log(`✓ installed -> ${path.relative(repoRoot, outPath)}`);
if (entry.runtimeDeps?.length) console.log(`  runtime deps: ${entry.runtimeDeps.join(', ')}`);

#!/usr/bin/env node
/**
 * generate-sbom.mjs — produce a Software Bill of Materials for the SHIPPED
 * (production) dependency graph, in SPDX and CycloneDX JSON, using npm's
 * built-in `npm sbom` (no extra tooling). Written to dist-pkg/.
 *
 *   node scripts/generate-sbom.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const outDir = path.join(repoRoot, 'dist-pkg');
mkdirSync(outDir, { recursive: true });

for (const [fmt, file] of [
  ['spdx', 'SBOM.spdx.json'],
  ['cyclonedx', 'SBOM.cyclonedx.json'],
]) {
  try {
    const out = execFileSync('npm', ['sbom', `--sbom-format=${fmt}`, '--omit=dev'], {
      cwd: repoRoot,
      maxBuffer: 32 * 1024 * 1024,
    });
    const dest = path.join(outDir, file);
    writeFileSync(dest, out);
    console.log(`✓ ${path.relative(repoRoot, dest)} (${out.length} bytes)`);
  } catch (e) {
    console.error(`✗ ${fmt} SBOM failed: ${e.message}`);
    process.exitCode = 1;
  }
}

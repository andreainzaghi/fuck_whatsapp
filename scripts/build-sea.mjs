#!/usr/bin/env node
/**
 * build-sea.mjs — turn the bundled launcher into a Node Single Executable
 * Application for the HOST platform. Produces build/fuck-whatsapp[.exe].
 *
 * Node SEA embeds the Node runtime + our launcher bundle, so the end user needs
 * NO Node install. Cross-platform builds run this on each OS in CI (the blob
 * must be injected into that OS's own `node`).
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const buildDir = path.join(repoRoot, 'build');
const bundle = path.join(buildDir, 'launcher.cjs');
const blob = path.join(buildDir, 'sea-prep.blob');
const configPath = path.join(buildDir, 'sea-config.json');
const exeName = process.platform === 'win32' ? 'fuck-whatsapp.exe' : 'fuck-whatsapp';
const exeOut = path.join(buildDir, exeName);

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

/**
 * The SEA fuse sentinel is a constant baked into each Node build and its
 * suffix changes across versions, so read it from THIS node rather than
 * hard-coding it (avoids postject "Could not find the sentinel" failures).
 */
function detectFuse(nodePath) {
  const buf = readFileSync(nodePath);
  const needle = Buffer.from('NODE_SEA_FUSE_');
  const at = buf.indexOf(needle);
  if (at === -1) {
    console.error('This Node build has no SEA fuse — use official Node >= 20.');
    process.exit(1);
  }
  // fuse = prefix + 32 lowercase-hex chars
  const hex = buf.subarray(at + needle.length, at + needle.length + 32).toString('latin1');
  return `NODE_SEA_FUSE_${hex}`;
}

const FUSE = detectFuse(process.execPath);
console.log(`• SEA fuse: ${FUSE.slice(0, 22)}…`);

if (!existsSync(bundle)) {
  console.error('Missing build/launcher.cjs — run: npm run bundle:launcher');
  process.exit(1);
}
mkdirSync(buildDir, { recursive: true });

// 1. SEA config
writeFileSync(
  configPath,
  JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }, null, 2),
);

// 2. generate the blob
console.log('• generating SEA blob…');
run(process.execPath, ['--experimental-sea-config', configPath]);

// 3. copy this platform's node as the base executable
rmSync(exeOut, { force: true });
copyFileSync(process.execPath, exeOut);
chmodSync(exeOut, 0o755);

// 4. (macOS) strip the existing signature before injecting
if (process.platform === 'darwin') {
  try {
    run('codesign', ['--remove-signature', exeOut]);
  } catch {
    /* may be unsigned already */
  }
}

// 5. inject the blob with postject
console.log('• injecting SEA blob…');
const postjectArgs = [
  'postject',
  exeOut,
  'NODE_SEA_BLOB',
  blob,
  '--sentinel-fuse',
  FUSE,
];
if (process.platform === 'darwin') postjectArgs.push('--macho-segment-name', 'NODE_SEA');
run('npx', ['--yes', ...postjectArgs]);

// 6. (macOS) re-sign ad-hoc so the binary loads
if (process.platform === 'darwin') {
  run('codesign', ['--sign', '-', '--force', exeOut]);
}

console.log(`✓ SEA executable -> ${path.relative(repoRoot, exeOut)}`);

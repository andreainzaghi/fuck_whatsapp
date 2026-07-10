#!/usr/bin/env node
/**
 * bundle-launcher.mjs — bundle the (already TypeScript-compiled) launcher and
 * all its workspace/npm dependencies into a single CommonJS file that Node's
 * Single Executable Application feature can embed. Build tooling only — never
 * shipped to users as source.
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(repoRoot, 'build', 'launcher.cjs');
mkdirSync(path.dirname(out), { recursive: true });

await build({
  entryPoints: [path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: out,
  // node: builtins stay external (dynamic require at runtime, incl. node:sea).
  // Everything else (ws, @fwa/*) is bundled in.
  banner: { js: '/* Fuck WhatsApp launcher — bundled for SEA. */' },
  logLevel: 'info',
});

console.log(`✓ bundled launcher -> ${path.relative(repoRoot, out)}`);

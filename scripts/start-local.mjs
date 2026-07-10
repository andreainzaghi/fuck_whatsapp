#!/usr/bin/env node
/**
 * start-local.mjs — start FWA locally.
 *
 *   npm start        production mode: serve the built frontend via the
 *                    launcher (localhost only, random port, CSP enforced)
 *   npm run dev      dev mode: `vite build --watch` for the frontend +
 *                    the same launcher. No HMR websocket, no relaxed CSP —
 *                    dev serves through the exact same hardened bridge.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const dev = process.argv.includes('--dev');
const launcherEntry = path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js');
const webDist = path.join(repoRoot, 'apps', 'web', 'dist', 'index.html');
const binPath = process.env.FWA_SIMPLEX_BIN ?? path.join(repoRoot, 'runtime', 'bin', 'simplex-chat');

if (!existsSync(binPath)) {
  console.error('SimpleX binary missing. Run: npm run setup');
  process.exit(1);
}

const children = [];
const run = (cmd, args, opts = {}) => {
  const child = spawn(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
  children.push(child);
  return child;
};

function shutdown() {
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function ensureBuilt() {
  if (existsSync(launcherEntry) && (dev || existsSync(webDist))) return;
  console.log('Building workspaces…');
  await new Promise((resolve, reject) => {
    const b = run('npm', ['run', 'build']);
    b.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))));
  });
}

await ensureBuilt();

if (dev) {
  // Rebuild the frontend on change; the launcher serves dist/ as usual.
  run('npm', ['run', 'build', '-w', 'apps/web', '--', '--watch'], { stdio: 'ignore' });
  if (!existsSync(webDist)) {
    console.log('Waiting for the first frontend build…');
    while (!existsSync(webDist)) await new Promise((r) => setTimeout(r, 500));
  }
}

const launcher = run('node', [launcherEntry], {
  env: { ...process.env, FWA_ROOT: repoRoot },
});
launcher.on('exit', (code) => {
  shutdown();
  process.exit(code ?? 0);
});

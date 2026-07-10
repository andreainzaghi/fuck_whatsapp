#!/usr/bin/env node
/**
 * ui-unlock-views.mjs — verifies the unlock flow in the real UI (existing
 * encrypted profile), including the wrong-password path, then walks the
 * Network and Settings views. Expects runtime/profiles/ui-a to exist
 * (created by ui-two-profile.mjs).
 *
 * Run:  node tests/e2e/ui-unlock-views.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const launcherEntry = path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js');
const profileDir = path.join(repoRoot, 'runtime', 'profiles', 'ui-a');
const shotsDir = path.join(repoRoot, 'test-results', 'ui-unlock');

if (!existsSync(path.join(profileDir, 'simplex_v1_chat.db'))) {
  console.error('run tests/e2e/ui-two-profile.mjs first (needs runtime/profiles/ui-a)');
  process.exit(1);
}
mkdirSync(shotsDir, { recursive: true });

const child = spawn('node', [launcherEntry], {
  cwd: repoRoot,
  env: { ...process.env, FWA_ROOT: repoRoot, FWA_PROFILE_DIR: profileDir, FWA_NO_OPEN: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const url = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('url timeout')), 30000);
  child.stdout.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/#b=[\w-]+/);
    if (m) {
      clearTimeout(t);
      resolve(m[0]);
    }
  });
});

const browser = await chromium.launch({ headless: !process.env.HEADFUL });
const page = await (await browser.newContext()).newPage();
let failures = 0;
const fail = (m) => {
  console.error(`✗ ${m}`);
  failures++;
};
const ok = (m) => console.log(`✓ ${m}`);

try {
  await page.goto(url);
  await page.waitForSelector('#ul-pw', { timeout: 30000 });
  ok('unlock screen shown for the existing encrypted profile');
  await page.screenshot({ path: path.join(shotsDir, '1-unlock.png') });

  /* wrong password must be rejected with a sanitized error */
  await page.fill('#ul-pw', 'wrong-password-attempt-1!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('#ul-err', { timeout: 90000 });
  const errText = await page.textContent('#ul-err');
  if (/wrong-password|password/i.test(errText ?? '')) ok(`wrong password rejected in the UI (${(errText ?? '').trim().slice(0, 60)})`);
  else fail(`unexpected unlock error text: ${errText}`);
  await page.screenshot({ path: path.join(shotsDir, '2-wrong-password.png') });

  /* correct password unlocks and history is present */
  await page.fill('#ul-pw', 'ui-passphrase-alice-42!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/#\/chats/, { timeout: 120000 });
  await page.waitForSelector('text=UiBob', { timeout: 60000 });
  ok('unlocked with the correct password — history restored (UiBob present)');
  await page.click('text=UiBob');
  const canary = ['FWA_SUPER', 'SECRET', 'CANARY', '928471'].join('_');
  await page.waitForSelector(`text=${canary}`, { timeout: 30000 });
  ok('previous conversation content visible after restart+unlock');
  await page.screenshot({ path: path.join(shotsDir, '3-history.png') });

  /* Network view renders real core servers */
  await page.goto(`${url.split('#')[0]}#/network`);
  await page.waitForSelector('text=smp', { timeout: 60000 });
  ok('Network view renders the servers reported by the core');
  await page.screenshot({ path: path.join(shotsDir, '4-network.png'), fullPage: true });

  /* Settings view */
  await page.goto(`${url.split('#')[0]}#/settings`);
  await page.waitForSelector('text=End-to-end encrypted', { timeout: 30000 });
  ok('Settings view renders the security panel');
  await page.screenshot({ path: path.join(shotsDir, '5-settings.png'), fullPage: true });
} catch (err) {
  failures++;
  console.error(`FAIL: ${err.message}`);
  await page.screenshot({ path: path.join(shotsDir, 'failure.png') }).catch(() => undefined);
} finally {
  await browser.close().catch(() => undefined);
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 2000));
}

console.log(failures === 0 ? '\nUI UNLOCK+VIEWS: PASS' : `\nUI UNLOCK+VIEWS: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

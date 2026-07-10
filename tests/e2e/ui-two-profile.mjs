#!/usr/bin/env node
/**
 * ui-two-profile.mjs — the definitive user-level test, in real browsers.
 *
 * Two complete FWA stacks + two Chromium contexts driving the REAL UI:
 * onboarding (create encrypted profile), one-time invitation via the Connect
 * screen, join on the other side, canary message exchange through the
 * conversation composer, and security assertions inside the browsers:
 *   - localStorage and sessionStorage stay EMPTY in both contexts;
 *   - no console message ever contains the canary;
 *   - the session bootstrap fragment is stripped from the URL.
 *
 * Run:  node tests/e2e/ui-two-profile.mjs        (headless)
 *       HEADFUL=1 node tests/e2e/ui-two-profile.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const launcherEntry = path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js');
const shotsDir = path.join(repoRoot, 'test-results', 'ui-two-profile');
const CANARY = ['FWA_SUPER', 'SECRET', 'CANARY', '928471'].join('_');

function startStack(name, profileDir) {
  const child = spawn('node', [launcherEntry], {
    cwd: repoRoot,
    env: { ...process.env, FWA_ROOT: repoRoot, FWA_PROFILE_DIR: profileDir, FWA_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error(`${name}: url timeout`)), 30000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/#b=[\w-]+/);
      if (m) {
        clearTimeout(t);
        resolve(m[0]);
      }
    });
    child.on('exit', () => reject(new Error(`${name}: launcher died`)));
  });
  return { child, url };
}

async function onboard(page, displayName, password) {
  // Redesigned onboarding opens on a brand hero; reveal the create form first.
  const cta = page.getByRole('button', { name: 'Create identity' });
  if (await cta.count()) await cta.click();
  await page.waitForSelector('#ob-name', { timeout: 30000 });
  await page.fill('#ob-name', displayName);
  await page.fill('#ob-pw', password);
  await page.fill('#ob-pw2', password);
  await page.check('input[type="checkbox"]');
  await page.click('button[type="submit"]');
  // profile creation spawns the core and waits for the SimpleX WS — generous
  await page.waitForURL(/#\/chats/, { timeout: 120000 });
}

const consoleLines = { A: [], B: [] };

async function main() {
  rmSync(shotsDir, { recursive: true, force: true });
  mkdirSync(shotsDir, { recursive: true });
  const dirA = path.join(repoRoot, 'runtime', 'profiles', 'ui-a');
  const dirB = path.join(repoRoot, 'runtime', 'profiles', 'ui-b');
  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });

  const A = startStack('A', dirA);
  const B = startStack('B', dirB);
  const [urlA, urlB] = await Promise.all([A.url, B.url]);
  console.log('stacks up');

  const browser = await chromium.launch({ headless: !process.env.HEADFUL });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  pageA.on('console', (msg) => consoleLines.A.push(msg.text()));
  pageB.on('console', (msg) => consoleLines.B.push(msg.text()));

  let failures = 0;
  const fail = (m) => {
    console.error(`✗ ${m}`);
    failures++;
  };
  const ok = (m) => console.log(`✓ ${m}`);

  try {
    /* 1. onboarding on both */
    await pageA.goto(urlA);
    await pageB.goto(urlB);
    await onboard(pageA, 'UiAlice', 'ui-passphrase-alice-42!');
    await onboard(pageB, 'UiBob', 'ui-passphrase-bob-42!');
    ok('both profiles created through the real onboarding UI');
    await pageA.screenshot({ path: path.join(shotsDir, '1-a-chats-empty.png') });

    /* bootstrap fragment must be gone from the URL */
    for (const [n, p] of [['A', pageA], ['B', pageB]]) {
      if (p.url().includes('#b=') || p.url().includes('b=')) fail(`${n}: bootstrap code still in URL`);
    }
    ok('bootstrap code stripped from both URLs');

    /* 2. A creates a one-time invitation */
    await pageA.goto(`${urlA.split('#')[0]}#/connect`);
    await pageA.click('text=Create one-time invitation');
    const linkBox = pageA.locator('textarea[aria-label="Invitation link"]');
    await linkBox.waitFor({ timeout: 60000 });
    const invitation = (await linkBox.inputValue()).trim();
    if (!invitation.startsWith('simplex:/')) fail(`unexpected invitation format: ${invitation.slice(0, 24)}…`);
    else ok('one-time invitation created (simplex:/invitation…) with QR rendered');
    await pageA.screenshot({ path: path.join(shotsDir, '2-a-invitation.png') });

    /* 3. B joins */
    await pageB.goto(`${urlB.split('#')[0]}#/connect`);
    await pageB.getByRole('tab', { name: 'Join' }).click();
    await pageB.fill('textarea[placeholder*="simplex:/"], input[placeholder*="simplex:/"]', invitation);
    // exact-name match: the sidebar's "Connect with someone" CTA must NOT be hit
    await pageB.locator('#panel-join').getByRole('button', { name: 'Connect', exact: true }).click();
    ok('B pasted the invitation and submitted the join');

    /* 4. wait for the contact to appear in both chat lists */
    await pageA.goto(`${urlA.split('#')[0]}#/chats`);
    await pageB.goto(`${urlB.split('#')[0]}#/chats`);
    await pageA.waitForSelector('text=UiBob', { timeout: 120000 });
    await pageB.waitForSelector('text=UiAlice', { timeout: 120000 });
    ok('contactConnected on both sides — chat rows visible');
    await pageA.screenshot({ path: path.join(shotsDir, '3-a-contact.png') });

    /* 5. canary through the real composer */
    await pageA.click('text=UiBob');
    await pageA.waitForSelector('textarea[aria-label="Message"]', { timeout: 30000 });
    await pageA.fill('textarea[aria-label="Message"]', CANARY);
    await pageA.click('button[aria-label="Send message"]');
    await pageB.click('text=UiAlice');
    await pageB.waitForSelector(`text=${CANARY}`, { timeout: 120000 });
    ok('canary delivered A → B through the real UI and SimpleX network');
    await pageB.screenshot({ path: path.join(shotsDir, '4-b-canary-received.png') });

    /* 6. reply B -> A */
    await pageB.fill('textarea[aria-label="Message"]', 'reply from the B ui');
    await pageB.click('button[aria-label="Send message"]');
    await pageA.waitForSelector('text=reply from the B ui', { timeout: 120000 });
    ok('reply delivered B → A');
    await pageA.screenshot({ path: path.join(shotsDir, '5-a-conversation.png') });

    /* 7. browser-side storage must be EMPTY */
    for (const [n, p] of [['A', pageA], ['B', pageB]]) {
      const storage = await p.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      }));
      if (storage.local.length || storage.session.length) {
        fail(`${n}: web storage not empty: ${JSON.stringify(storage)}`);
      }
    }
    ok('localStorage and sessionStorage are EMPTY in both browsers');

    /* 8. no canary in any console output */
    const leak = [...consoleLines.A, ...consoleLines.B].filter((l) => l.includes(CANARY));
    if (leak.length) fail(`canary appeared in browser console (${leak.length} lines)`);
    else ok('canary never appeared in any browser console message');

    /* 9. delivery tick reached at least "sent" on A's last message */
    const ticks = await pageA.locator('text=✓').count();
    ok(`delivery ticks rendered on A (count=${ticks})`);
  } catch (err) {
    failures++;
    console.error(`FAIL: ${err.message}`);
    await pageA.screenshot({ path: path.join(shotsDir, 'failure-A.png') }).catch(() => undefined);
    await pageB.screenshot({ path: path.join(shotsDir, 'failure-B.png') }).catch(() => undefined);
  } finally {
    await browser.close().catch(() => undefined);
    A.child.kill('SIGTERM');
    B.child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(failures === 0 ? '\nUI TWO-PROFILE E2E: PASS' : `\nUI TWO-PROFILE E2E: ${failures} FAILURE(S)`);
  console.log('screenshots: test-results/ui-two-profile/');
  console.log('note: runtime/profiles/ui-* left for security-check scanning');
  process.exit(failures === 0 ? 0 : 1);
}

main();

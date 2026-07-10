#!/usr/bin/env node
/**
 * screenshots.mjs — visual capture of the redesigned UI with REAL data.
 *
 * Boots two full FWA stacks, connects them, exchanges a few messages, then
 * walks every surface in ONE authenticated context (the bootstrap code is
 * single-use, so we keep the same page and only switch viewport + colorScheme
 * via Playwright emulation). Saves PNGs to test-results/redesign/ and asserts
 * the preserved test hooks so it doubles as a smoke regression.
 *
 * Run:  node tests/e2e/screenshots.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const launcherEntry = path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js');
const outDir = path.join(repoRoot, 'test-results', 'redesign');

function startStack(name, profile) {
  const dir = path.join(repoRoot, 'runtime', 'profiles', profile);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const child = spawn('node', [launcherEntry], {
    cwd: repoRoot,
    env: { ...process.env, FWA_ROOT: repoRoot, FWA_PROFILE_DIR: dir, FWA_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error(`${name} url timeout`)), 30000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/#b=[\w-]+/);
      if (m) {
        clearTimeout(t);
        resolve(m[0]);
      }
    });
  });
  return { child, url };
}

async function onboard(page, name, pw) {
  const cta = page.getByRole('button', { name: 'Create identity' });
  if (await cta.count()) await cta.click();
  await page.waitForSelector('#ob-name', { timeout: 30000 });
  await page.fill('#ob-name', name);
  await page.fill('#ob-pw', pw);
  await page.fill('#ob-pw2', pw);
  await page.check('input[type="checkbox"]');
  await page.click('button[type="submit"]');
  await page.waitForURL(/#\/chats/, { timeout: 120000 });
}

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const A = startStack('A', 'shot-a');
  const B = startStack('B', 'shot-b');
  const [urlA, urlB] = await Promise.all([A.url, B.url]);
  const baseA = urlA.split('#')[0];

  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: MOBILE });
  const ctxB = await browser.newContext({ viewport: DESKTOP });
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();

  let shots = 0;
  const missing = [];
  const snap = async (page, tag) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outDir, `${tag}.png`) });
    shots++;
    console.log(`  📸 ${tag}`);
  };
  const need = async (page, sel, label) => {
    if ((await page.locator(sel).count()) === 0) missing.push(label);
  };

  try {
    // --- Onboarding brand hero (fresh, no-profile) in mobile dark + light ---
    await pa.goto(urlA);
    await pa.getByRole('button', { name: 'Create identity' }).waitFor({ timeout: 30000 });
    for (const scheme of ['dark', 'light']) {
      await pa.emulateMedia({ colorScheme: scheme });
      await snap(pa, `onboarding-hero-mobile-${scheme}`);
    }
    // reveal + capture the create form (its submit is also "Create identity")
    await pa.emulateMedia({ colorScheme: 'dark' });
    await pa.getByRole('button', { name: 'Create identity' }).click();
    await pa.waitForSelector('#ob-name', { timeout: 30000 });
    await need(pa, '#ob-name', `onboarding #ob-name`);
    await pa.fill('#ob-name', 'Marco');
    await pa.fill('#ob-pw', 'screens-passphrase-a-1!');
    await pa.fill('#ob-pw2', 'screens-passphrase-a-1!');
    await snap(pa, 'onboarding-form-mobile-dark');

    // --- Create both profiles + a real conversation ---
    await pa.check('input[type="checkbox"]');
    await pa.click('button[type="submit"]');
    await pa.waitForURL(/#\/chats/, { timeout: 120000 });
    await pb.goto(urlB);
    await onboard(pb, 'Davide', 'screens-passphrase-b-1!');
    console.log('profiles created');

    await pa.goto(`${baseA}#/connect`);
    await pa.click('text=Create one-time invitation');
    await pa.locator('textarea[aria-label="Invitation link"]').waitFor({ timeout: 60000 });
    const link = (await pa.locator('textarea[aria-label="Invitation link"]').inputValue()).trim();
    await need(pa, 'canvas', 'invite QR canvas');

    const baseB = urlB.split('#')[0];
    await pb.goto(`${baseB}#/connect`);
    await pb.getByRole('tab', { name: 'Join' }).click();
    await pb.fill('textarea[placeholder*="simplex:/"], input[placeholder*="simplex:/"]', link);
    await pb.locator('#panel-join').getByRole('button', { name: 'Connect', exact: true }).click();
    await pa.waitForSelector('text=Davide', { timeout: 120000 });
    await pb.waitForSelector('text=Marco', { timeout: 120000 });
    console.log('connected');

    await pa.goto(`${baseA}#/chats`);
    await pa.click('text=Davide');
    await pa.waitForSelector('textarea[aria-label="Message"]');
    for (const m of ['Ciao Davide 👋', 'Tutto pronto per il lancio?', 'Niente numeri. Niente account. 🔒']) {
      await pa.fill('textarea[aria-label="Message"]', m);
      await pa.click('button[aria-label="Send message"]');
      await pa.waitForTimeout(500);
    }
    await pb.goto(`${baseB}#/chats`);
    await pb.click('text=Marco');
    await pb.waitForSelector('textarea[aria-label="Message"]');
    await pb.fill('textarea[aria-label="Message"]', 'Sì, procediamo. Ottimo lavoro.');
    await pb.click('button[aria-label="Send message"]');
    await pa.waitForSelector('text=procediamo', { timeout: 60000 });
    console.log('messages exchanged');

    // --- Tour every surface at MOBILE and DESKTOP, dark + light (context A) ---
    const surfaces = [
      ['chats', `${baseA}#/chats`, null],
      ['conversation', `${baseA}#/chats`, 'text=Davide'],
      ['connect', `${baseA}#/connect`, null],
      ['network', `${baseA}#/network`, null],
      ['settings', `${baseA}#/settings`, null],
    ];
    for (const [size, sizeTag] of [[MOBILE, 'mobile'], [DESKTOP, 'desktop']]) {
      await pa.setViewportSize(size);
      for (const scheme of ['dark', 'light']) {
        await pa.emulateMedia({ colorScheme: scheme });
        for (const [label, route, click] of surfaces) {
          await pa.goto(route);
          if (click) await pa.click(click).catch(() => undefined);
          await pa.waitForTimeout(350);
          await snap(pa, `${label}-${sizeTag}-${scheme}`);
        }
      }
    }

    // --- Hook assertions on the live redesigned UI ---
    await pa.setViewportSize(MOBILE);
    await pa.goto(`${baseA}#/chats`);
    await pa.click('text=Davide');
    await need(pa, 'textarea[aria-label="Message"]', 'composer Message');
    await need(pa, 'button[aria-label="Send message"], button[aria-label="Record a voice message"]', 'send/record');
    await need(pa, 'button[aria-label="Attach a file"]', 'attach');
    await pa.goto(`${baseA}#/settings`);
    await need(pa, 'text=End-to-end encrypted', 'settings E2EE text');
    await pa.goto(`${baseA}#/network`);
    await pa.waitForTimeout(600);
    await need(pa, 'text=smp', 'network smp text');

    console.log(`\n${shots} screenshots -> ${path.relative(repoRoot, outDir)}`);
    if (missing.length) {
      console.log('MISSING HOOKS:', missing.join(', '));
      process.exitCode = 1;
    } else {
      console.log('✓ all sampled hooks present in the redesigned UI');
    }
  } catch (err) {
    console.error('screenshot run error:', err.message);
    await pa.screenshot({ path: path.join(outDir, 'ERROR-a.png') }).catch(() => undefined);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => undefined);
    A.child.kill('SIGTERM');
    B.child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 2500));
  }
}

main();

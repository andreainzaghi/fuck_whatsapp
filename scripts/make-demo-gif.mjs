#!/usr/bin/env node
/**
 * make-demo-gif.mjs — record a short, real product demo and turn it into an
 * optimized GIF for the README. Uses two local instances with DISPOSABLE test
 * profiles (never personal data). Fully local; no third-party services.
 *
 * Flow (mobile viewport, instance A is recorded):
 *   onboarding hero -> create identity -> chat list -> receive a message from B
 *   -> type + send a reply -> delivery ticks.
 *
 * Requires ffmpeg. Run:  node scripts/make-demo-gif.mjs
 * Output: docs/assets/demo.gif
 */
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const launcherEntry = path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js');
const outGif = path.join(repoRoot, 'docs', 'assets', 'demo.gif');
const videoDir = path.join(repoRoot, 'runtime', 'demo-video');
rmSync(videoDir, { recursive: true, force: true });
mkdirSync(videoDir, { recursive: true });

function startStack(profile) {
  const dir = path.join(repoRoot, 'runtime', profile);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const child = spawn('node', [launcherEntry], {
    cwd: repoRoot,
    env: { ...process.env, FWA_ROOT: repoRoot, FWA_PROFILE_DIR: dir, FWA_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = new Promise((res, rej) => {
    let b = '';
    const t = setTimeout(() => rej(new Error(`${profile}: url timeout`)), 40000);
    child.stdout.on('data', (d) => {
      b += d.toString();
      const m = b.match(/http:\/\/127\.0\.0\.1:\d+\/#b=[\w-]+/);
      if (m) {
        clearTimeout(t);
        res(m[0]);
      }
    });
  });
  return { child, url };
}

// Minimal backend client for instance B (no browser).
class Backend {
  constructor(url) {
    this.origin = new URL(url).origin;
    this.boot = url.split('#b=')[1];
    this.corr = 0;
    this.pending = new Map();
    this.events = [];
    this.waiters = [];
  }
  async session() {
    const r = await fetch(`${this.origin}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: this.origin },
      body: JSON.stringify({ bootstrap: this.boot }),
    });
    this.cookie = r.headers.get('set-cookie').split(';')[0];
  }
  async create(name, pw) {
    await fetch(`${this.origin}/api/profile/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: this.origin, Cookie: this.cookie },
      body: JSON.stringify({ displayName: name, password: pw }),
    });
  }
  async ws() {
    this.sock = new WebSocket(`${this.origin.replace('http', 'ws')}/api/ws`, { headers: { Origin: this.origin, Cookie: this.cookie } });
    await new Promise((res, rej) => {
      this.sock.once('open', res);
      this.sock.once('error', rej);
    });
    this.sock.on('message', (d) => {
      const p = JSON.parse(d.toString());
      if (p.corrId && this.pending.has(p.corrId)) {
        this.pending.get(p.corrId)(p.resp);
        this.pending.delete(p.corrId);
      } else if (p.resp) {
        this.events.push(p.resp);
        for (let i = this.waiters.length - 1; i >= 0; i--)
          if (this.waiters[i].m(p.resp)) {
            this.waiters[i].r(p.resp);
            this.waiters.splice(i, 1);
          }
      }
    });
  }
  cmd(c, t = 60000) {
    return new Promise((res, rej) => {
      const id = String(++this.corr);
      this.pending.set(id, res);
      this.sock.send(JSON.stringify({ corrId: id, cmd: c }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rej(new Error('timeout ' + c.slice(0, 20)));
        }
      }, t);
    });
  }
  wait(m, t = 120000) {
    const f = this.events.find(m);
    if (f) return Promise.resolve(f);
    return new Promise((res, rej) => {
      this.waiters.push({ m, r: res });
      setTimeout(() => rej(new Error('event timeout')), t);
    });
  }
}

async function main() {
  const A = startStack('demo-a');
  const B = startStack('demo-b');
  const [urlA, urlB] = await Promise.all([A.url, B.url]);
  const baseA = urlA.split('#')[0];

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 380, height: 800 },
    recordVideo: { dir: videoDir, size: { width: 380, height: 800 } },
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();

  // B connects in the background (no browser)
  const b = new Backend(urlB);
  await b.session();
  await b.create('Sam', 'demo-passphrase-b-1!');
  await b.ws();

  try {
    // --- record A: onboarding hero ---
    await page.goto(urlA);
    await page.getByRole('button', { name: 'Create identity' }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1400); // let the hero animate / read

    // create identity
    await page.getByRole('button', { name: 'Create identity' }).click();
    await page.waitForSelector('#ob-name', { timeout: 30000 });
    await page.type('#ob-name', 'Alex', { delay: 90 });
    await page.type('#ob-pw', 'demo-passphrase-a-1!', { delay: 30 });
    await page.type('#ob-pw2', 'demo-passphrase-a-1!', { delay: 30 });
    await page.check('input[type="checkbox"]');
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');
    await page.waitForURL(/#\/chats/, { timeout: 120000 });
    await page.waitForTimeout(1000);

    // connect A<->B: A creates an invitation, B accepts it in the background
    await page.goto(`${baseA}#/connect`);
    await page.click('text=Create one-time invitation');
    await page.locator('textarea[aria-label="Invitation link"]').waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200); // show the QR briefly
    const link = (await page.locator('textarea[aria-label="Invitation link"]').inputValue()).trim();
    await b.cmd(`/connect ${link}`);
    const bC = await b.wait((e) => e.type === 'contactConnected');

    // back to chats, open the conversation
    await page.goto(`${baseA}#/chats`);
    await page.waitForSelector('text=Sam', { timeout: 120000 });
    await page.waitForTimeout(700);
    await page.click('text=Sam');
    await page.waitForSelector('textarea[aria-label="Message"]');
    await page.waitForTimeout(600);

    // B sends an incoming message
    await b.cmd(`/_send @${bC.contact.contactId} text No phone. No account. Just us. 👋`);
    await page.waitForSelector('text=Just us', { timeout: 60000 });
    await page.waitForTimeout(900);

    // A types + sends a reply (visible typing)
    await page.click('textarea[aria-label="Message"]');
    await page.type('textarea[aria-label="Message"]', 'Fuck centralized identity 🔒', { delay: 85 });
    await page.waitForTimeout(400);
    await page.click('button[aria-label="Send message"]');
    await page.waitForTimeout(1800); // show the sent bubble + ticks
  } finally {
    await ctx.close(); // flushes the video file
    await browser.close().catch(() => undefined);
    A.child.kill('SIGTERM');
    B.child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 2500));
    try { execFileSync('pkill', ['-9', '-f', 'simplex-chat']); } catch { /* noop */ }
  }

  // find the recorded webm
  const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
  if (!webm) {
    console.error('no video recorded');
    process.exit(1);
  }
  const webmPath = path.join(videoDir, webm);

  // webm -> optimized GIF via ffmpeg (palette for quality/size)
  const palette = path.join(videoDir, 'palette.png');
  const fps = '13';
  const scale = 'scale=300:-1:flags=lanczos';
  console.log('encoding GIF…');
  execFileSync('ffmpeg', ['-y', '-i', webmPath, '-vf', `fps=${fps},${scale},palettegen=stats_mode=diff`, palette], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-i', webmPath, '-i', palette, '-lavfi', `fps=${fps},${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`, outGif], { stdio: 'ignore' });
  rmSync(videoDir, { recursive: true, force: true });

  const size = execFileSync('du', ['-h', outGif]).toString().split('\t')[0];
  console.log(`✓ ${path.relative(repoRoot, outGif)} (${size})`);
}

main();

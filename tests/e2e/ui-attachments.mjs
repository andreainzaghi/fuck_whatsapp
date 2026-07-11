#!/usr/bin/env node
/**
 * ui-attachments.mjs — attachments through the REAL UI: image send via the
 * file picker and a voice note recorded with MediaRecorder over Chromium's
 * fake audio device. Verifies delivery to the peer over the SimpleX network
 * (XFTP) and rendering on both sides.
 *
 * Uses the profiles created by ui-two-profile.mjs (ui-a / ui-b).
 * Run:  node tests/e2e/ui-attachments.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const launcherEntry = path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js');
const shotsDir = path.join(repoRoot, 'test-results', 'ui-attachments');
mkdirSync(shotsDir, { recursive: true });

for (const p of ['ui-a', 'ui-b']) {
  if (!existsSync(path.join(repoRoot, 'runtime', 'profiles', p, 'simplex_v1_chat.db'))) {
    console.error('run tests/e2e/ui-two-profile.mjs first');
    process.exit(1);
  }
}

/* build a small valid PNG (64x64 red) without dependencies */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(64, 0);
ihdr.writeUInt32BE(64, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const raw = Buffer.concat(Array.from({ length: 64 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(64 * 3, Buffer.from([0xe5, 0x48, 0x4d]))])));
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const pngPath = path.join(shotsDir, 'attach-test.png');
writeFileSync(pngPath, png);

function startStack(name, profile) {
  const child = spawn('node', [launcherEntry], {
    cwd: repoRoot,
    env: { ...process.env, FWA_ROOT: repoRoot, FWA_PROFILE_DIR: path.join(repoRoot, 'runtime', 'profiles', profile), FWA_NO_OPEN: '1' },
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

async function unlock(page, url, password) {
  await page.goto(url);
  await page.waitForSelector('#ul-pw', { timeout: 60000 });
  await page.fill('#ul-pw', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/#\/chats/, { timeout: 120000 });
}

const A = startStack('A', 'ui-a');
const B = startStack('B', 'ui-b');
const [urlA, urlB] = await Promise.all([A.url, B.url]);

const browser = await chromium.launch({
  headless: !process.env.HEADFUL,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const ctxA = await browser.newContext({ permissions: ['microphone'] });
const ctxB = await browser.newContext();
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

let failures = 0;
const fail = (m) => {
  console.error(`✗ ${m}`);
  failures++;
};
const ok = (m) => console.log(`✓ ${m}`);

try {
  await unlock(pageA, urlA, 'ui-passphrase-alice-42!');
  await unlock(pageB, urlB, 'ui-passphrase-bob-42!');
  ok('both profiles unlocked');

  await pageA.click('text=UiBob');
  await pageB.click('text=UiAlice');
  await pageA.waitForSelector('textarea[aria-label="Message"]', { timeout: 30000 });

  /* ---- image through the real file picker ---- */
  const [chooser] = await Promise.all([
    pageA.waitForEvent('filechooser'),
    pageA.click('button[aria-label="Attach a file"]'),
  ]);
  await chooser.setFiles(pngPath);
  // the composer may show a preview+send step; press the send button
  await pageA.click('button[aria-label="Send message"]').catch(() => undefined);
  await pageB.waitForSelector('img[src^="data:image"], img[src*="/api/file"]', { timeout: 180000 });
  ok('image sent from A via the UI file picker and rendered on B (XFTP)');
  await pageB.screenshot({ path: path.join(shotsDir, '1-b-image.png') });

  /* ---- voice note with fake microphone ---- */
  await pageA.click('button[aria-label="Record a voice message"]');
  await pageA.waitForTimeout(2500);
  await pageA.click('button[aria-label="Stop recording"]');
  await pageA.click('button[aria-label="Send voice message"]');
  ok('voice note recorded (fake mic) and sent from A');
  await pageB.waitForSelector('audio, [aria-label="Seek"]', { timeout: 180000 });
  ok('voice note rendered with player on B');
  await pageB.screenshot({ path: path.join(shotsDir, '2-b-voice.png') });
} catch (err) {
  failures++;
  console.error(`FAIL: ${err.message}`);
  await pageA.screenshot({ path: path.join(shotsDir, 'failure-A.png') }).catch(() => undefined);
  await pageB.screenshot({ path: path.join(shotsDir, 'failure-B.png') }).catch(() => undefined);
} finally {
  await browser.close().catch(() => undefined);
  A.child.kill('SIGTERM');
  B.child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 2000));
}

console.log(failures === 0 ? '\nUI ATTACHMENTS: PASS' : `\nUI ATTACHMENTS: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

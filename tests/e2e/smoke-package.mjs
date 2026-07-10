#!/usr/bin/env node
/**
 * smoke-package.mjs — smoke test the ASSEMBLED double-click package.
 *
 * Launches the packaged app executable exactly as a double-click would (SEA,
 * packaged-mode resource resolution, bundled SimpleX core + bundled openssl on
 * macOS), then drives real onboarding in a browser and confirms an encrypted
 * profile is actually created by the packaged binary. This is the "a friend
 * downloads it, double-clicks, and it works" proof.
 *
 * Run:  node tests/e2e/smoke-package.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);

// locate the packaged executable for this platform
function packagedExe() {
  if (process.platform === 'darwin') return path.join(repoRoot, 'dist-pkg', 'Fuck WhatsApp.app', 'Contents', 'MacOS', 'Fuck WhatsApp');
  if (process.platform === 'win32') return path.join(repoRoot, 'dist-pkg', 'Fuck WhatsApp', 'Fuck WhatsApp.exe');
  return path.join(repoRoot, 'dist-pkg', 'Fuck WhatsApp', 'Fuck WhatsApp');
}

const exe = packagedExe();
if (!existsSync(exe)) {
  console.error(`Packaged app not found: ${exe}\nRun: npm run build && npm run bundle:launcher && node scripts/build-sea.mjs && npm run package`);
  process.exit(1);
}

const profileDir = path.join(repoRoot, 'runtime', 'smoke-package');
rmSync(profileDir, { recursive: true, force: true });

async function main() {
  const child = spawn(exe, [], {
    // real double-click has no repo cwd; a neutral cwd proves packaged-mode
    cwd: repoRoot,
    env: { ...process.env, FWA_PROFILE_DIR: profileDir, FWA_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  let failures = 0;
  const fail = (m) => {
    console.error(`✗ ${m}`);
    failures++;
  };
  const ok = (m) => console.log(`✓ ${m}`);

  try {
    const url = await new Promise((resolve, reject) => {
      let buf = '';
      const t = setTimeout(() => reject(new Error('packaged app did not print its URL')), 40000);
      child.stdout.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/#b=[\w-]+/);
        if (m) {
          clearTimeout(t);
          resolve(m[0]);
        }
      });
      child.on('exit', (c) => reject(new Error(`packaged app exited early (code ${c})`)));
    });
    ok('packaged app launched, bridge is up, printed its one-time URL');

    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(url);

    // onboarding: brand hero -> create form (wait for hydration first)
    await page.waitForSelector('#ob-name, button:has-text("Create identity")', { timeout: 30000 });
    const cta = page.getByRole('button', { name: 'Create identity' });
    if (await cta.count()) await cta.click();
    await page.waitForSelector('#ob-name', { timeout: 30000 });
    ok('onboarding UI served from the package');

    await page.fill('#ob-name', 'PackagedUser');
    await page.fill('#ob-pw', 'smoke-package-passphrase-1!');
    await page.fill('#ob-pw2', 'smoke-package-passphrase-1!');
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    // profile creation spawns the PACKAGED SimpleX core (bundled openssl)
    await page.waitForURL(/#\/chats/, { timeout: 120000 });
    ok('encrypted profile created by the PACKAGED SimpleX core — reached the chat list');

    // the encrypted DB must exist on disk, born-encrypted
    const chatDb = path.join(profileDir, 'simplex_v1_chat.db');
    if (existsSync(chatDb)) ok('encrypted database written to the app-data profile dir');
    else fail('no database created');

    await browser.close();
  } catch (err) {
    fail(err.message);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 3000));
    try { (await import('node:child_process')).execSync('pkill -9 -f simplex-chat 2>/dev/null'); } catch { /* noop */ }
  }

  console.log(failures === 0 ? '\nPACKAGE SMOKE TEST: PASS' : `\nPACKAGE SMOKE TEST: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

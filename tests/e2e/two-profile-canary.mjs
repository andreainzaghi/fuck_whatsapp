#!/usr/bin/env node
/**
 * two-profile-canary.mjs — the decisive functional + security test.
 *
 * Boots TWO full FWA stacks (launcher -> bridge -> SimpleX core) with separate
 * profiles, exactly as two real users on two computers would, then:
 *   1. creates profile A and profile B through the authenticated bridge REST;
 *   2. creates a one-time invitation on A (bridge WS proxy, cookie auth);
 *   3. accepts it on B; waits for contactConnected on both sides;
 *   4. exchanges messages both ways INCLUDING the canary message;
 *   5. restarts both stacks and verifies history persists (encrypted DB, unlock);
 *   6. verifies a wrong password does NOT open the database;
 *   7. leaves runtime artifacts in place for scripts/security-check.mjs to scan.
 *
 * The canary literal is assembled from parts so it never exists in source.
 * Run:  node tests/e2e/two-profile-canary.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const CANARY = ['FWA_SUPER', 'SECRET', 'CANARY', '928471'].join('_');
const PASS_A = 'canary-passphrase-A-31337!';
const PASS_B = 'canary-passphrase-B-31337!';

const launcherEntry = path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js');

function log(step) {
  process.stdout.write(`\n=== ${step}\n`);
}

/** Minimal authenticated client for one FWA stack. */
class Stack {
  constructor(name, profileDir) {
    this.name = name;
    this.profileDir = profileDir;
    this.child = null;
    this.origin = null;
    this.cookie = null;
    this.ws = null;
    this.corrId = 0;
    this.pending = new Map();
    this.events = [];
    this.waiters = [];
  }

  async start() {
    this.child = spawn('node', [launcherEntry], {
      cwd: repoRoot,
      env: { ...process.env, FWA_ROOT: repoRoot, FWA_PROFILE_DIR: this.profileDir, FWA_NO_OPEN: '1' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    // Grab the printed launch URL (interactive bootstrap channel).
    const url = await new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error(`${this.name}: launcher URL timeout`)), 30000);
      this.child.stdout.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/#b=[\w-]+/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
      });
      this.child.on('exit', () => reject(new Error(`${this.name}: launcher died at start`)));
    });
    const u = new URL(url);
    this.origin = `${u.protocol}//${u.host}`;
    const bootstrap = url.split('#b=')[1];
    const res = await fetch(`${this.origin}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: this.origin },
      body: JSON.stringify({ bootstrap }),
    });
    if (res.status !== 200) throw new Error(`${this.name}: session exchange failed ${res.status}`);
    const setCookie = res.headers.get('set-cookie');
    this.cookie = setCookie.split(';')[0];
    return res.json();
  }

  async api(route, body) {
    const res = await fetch(`${this.origin}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: this.origin,
        Cookie: this.cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  async openWs() {
    this.ws = new WebSocket(`${this.origin.replace('http', 'ws')}/api/ws`, {
      headers: { Origin: this.origin, Cookie: this.cookie },
    });
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.corrId && this.pending.has(parsed.corrId)) {
        this.pending.get(parsed.corrId)(parsed.resp);
        this.pending.delete(parsed.corrId);
      } else if (parsed.resp) {
        this.events.push(parsed.resp);
        for (let i = this.waiters.length - 1; i >= 0; i--) {
          if (this.waiters[i].match(parsed.resp)) {
            this.waiters[i].resolve(parsed.resp);
            this.waiters.splice(i, 1);
          }
        }
      }
    });
  }

  cmd(c, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const id = String(++this.corrId);
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ corrId: id, cmd: c }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${this.name}: timeout ${c.slice(0, 40)}`));
        }
      }, timeoutMs);
    });
  }

  waitEvent(match, desc, timeoutMs = 120000) {
    const found = this.events.find(match);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      this.waiters.push({ match, resolve });
      setTimeout(() => reject(new Error(`${this.name}: event timeout ${desc}`)), timeoutMs);
    });
  }

  async stop() {
    this.ws?.close();
    if (this.child && this.child.exitCode === null) {
      this.child.kill('SIGTERM');
      await new Promise((r) => {
        this.child.once('exit', r);
        setTimeout(r, 6000);
      });
    }
  }
}

async function main() {
  const baseDir = path.join(repoRoot, 'runtime', 'profiles');
  const dirA = path.join(baseDir, 'canary-a');
  const dirB = path.join(baseDir, 'canary-b');
  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
  mkdirSync(dirA, { recursive: true });
  mkdirSync(dirB, { recursive: true });

  const A = new Stack('A', dirA);
  const B = new Stack('B', dirB);

  try {
    log('1. start both stacks (bridge auth handshake)');
    await A.start();
    await B.start();
    console.log('ok: two bridges up, sessions established');

    log('2. create profiles (encrypted DB born from first write)');
    const ca = await A.api('/api/profile/create', { displayName: 'CanaryAlice', password: PASS_A });
    const cb = await B.api('/api/profile/create', { displayName: 'CanaryBob', password: PASS_B });
    if (!ca.body?.ok || !cb.body?.ok) throw new Error(`profile create failed: ${ca.status}/${cb.status}`);
    console.log('ok: profiles created, cores running');

    log('3. connect: one-time invitation A -> B');
    await A.openWs();
    await B.openWs();
    const uA = await A.cmd('/u');
    const inv = await A.cmd(`/_connect ${uA.user.userId}`);
    const link = inv.connLinkInvitation?.connFullLink;
    if (!link) throw new Error('no invitation link');
    console.log('ok: invitation created');
    await B.cmd(`/connect ${link}`);
    const bContact = await B.waitEvent((e) => e.type === 'contactConnected', 'B contactConnected');
    const aContact = await A.waitEvent((e) => e.type === 'contactConnected', 'A contactConnected');
    console.log(`ok: connected (A sees ${aContact.contact.localDisplayName}, B sees ${bContact.contact.localDisplayName})`);

    log('4. canary message A -> B and reply B -> A');
    await A.cmd(`/_send @${aContact.contact.contactId} text ${CANARY}`);
    const bMsg = await B.waitEvent(
      (e) => e.type === 'newChatItems' && e.chatItems?.[0]?.chatItem?.content?.msgContent?.text === CANARY,
      'B canary received',
    );
    console.log('ok: B received the canary through the SimpleX network');
    await B.cmd(`/_send @${bContact.contact.contactId} text roger-roger`);
    await A.waitEvent(
      (e) => e.type === 'newChatItems' && e.chatItems?.[0]?.chatItem?.content?.msgContent?.text === 'roger-roger',
      'A reply received',
    );
    console.log('ok: A received the reply');
    if (!bMsg) throw new Error('unreachable');

    log('5. restart stacks — persistence through encrypted DB');
    await A.stop();
    await B.stop();
    const A2 = new Stack('A2', dirA);
    await A2.start();

    log('5a. wrong password MUST fail');
    const wrong = await A2.api('/api/profile/open', { password: 'definitely-not-the-password' });
    if (wrong.status !== 403 || wrong.body?.code !== 'wrong-password') {
      throw new Error(`wrong password was not rejected correctly: ${wrong.status} ${JSON.stringify(wrong.body)}`);
    }
    console.log('ok: wrong password rejected (DB stays locked, fail-closed)');

    log('5b. correct password opens, history intact');
    const open = await A2.api('/api/profile/open', { password: PASS_A });
    if (!open.body?.ok) throw new Error(`reopen failed: ${JSON.stringify(open.body)}`);
    await A2.openWs();
    const hist = await A2.cmd(`/_get chat @${aContact.contact.contactId} count=10`);
    const texts = (hist.chat?.chatItems ?? []).map((i) => i.content?.msgContent?.text).filter(Boolean);
    if (!texts.includes(CANARY) || !texts.includes('roger-roger')) {
      throw new Error(`history incomplete after restart: ${JSON.stringify(texts.map((t) => t.slice(0, 12)))}`);
    }
    console.log('ok: history persisted across restart, unlocked with the correct password');
    await A2.stop();

    log('RESULT');
    console.log('TWO-PROFILE CANARY E2E: PASS');
    console.log('Note: runtime/profiles/canary-* left on disk ON PURPOSE for scripts/security-check.mjs to scan.');
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await A.stop().catch(() => undefined);
    await B.stop().catch(() => undefined);
  }
}

main();

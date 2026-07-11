#!/usr/bin/env node
/**
 * two-user.mjs — the decisive two-user functional test, using two SEPARATE data
 * directories (runtime/test-user-a, runtime/test-user-b), never personal
 * profiles. Drives two full FWA stacks (launcher -> bridge -> SimpleX core)
 * through the authenticated bridge, over the real SimpleX network:
 *
 *   create A, create B, one-time invitation, connect, A->B (private canary),
 *   B->A, restart, persistence, database locked, wrong password rejected,
 *   correct password opens.
 *
 * Media (image/file/voice) is covered by tests/e2e/ui-attachments.mjs.
 * The canary is assembled from parts; runtime/test-user-* are left on disk so
 * tests/security/canary-scan.mjs can prove it never leaked.
 *
 * Run:  node tests/e2e/two-user.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const launcherEntry = path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js');
const CANARY = ['FWA', 'FINAL', 'SECRET', 'CANARY', '984721'].join('_');
const PASS_A = 'two-user-passphrase-A-1!';
const PASS_B = 'two-user-passphrase-B-1!';

class Stack {
  constructor(name, dir) {
    this.name = name;
    this.dir = dir;
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
      env: { ...process.env, FWA_ROOT: repoRoot, FWA_PROFILE_DIR: this.dir, FWA_NO_OPEN: '1' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const url = await new Promise((resolve, reject) => {
      let buf = '';
      const t = setTimeout(() => reject(new Error(`${this.name}: URL timeout`)), 40000);
      this.child.stdout.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/#b=[\w-]+/);
        if (m) {
          clearTimeout(t);
          resolve(m[0]);
        }
      });
      this.child.on('exit', () => reject(new Error(`${this.name}: launcher exited at start`)));
    });
    this.origin = new URL(url).origin;
    const res = await fetch(`${this.origin}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: this.origin },
      body: JSON.stringify({ bootstrap: url.split('#b=')[1] }),
    });
    if (res.status !== 200) throw new Error(`${this.name}: session exchange ${res.status}`);
    this.cookie = res.headers.get('set-cookie').split(';')[0];
  }
  async api(route, body) {
    const res = await fetch(`${this.origin}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Origin: this.origin, Cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  async openWs() {
    this.ws = new WebSocket(`${this.origin.replace('http', 'ws')}/api/ws`, { headers: { Origin: this.origin, Cookie: this.cookie } });
    await new Promise((res, rej) => {
      this.ws.once('open', res);
      this.ws.once('error', rej);
    });
    this.ws.on('message', (data) => {
      const p = JSON.parse(data.toString());
      if (p.corrId && this.pending.has(p.corrId)) {
        this.pending.get(p.corrId)(p.resp);
        this.pending.delete(p.corrId);
      } else if (p.resp) {
        this.events.push(p.resp);
        for (let i = this.waiters.length - 1; i >= 0; i--)
          if (this.waiters[i].match(p.resp)) {
            this.waiters[i].resolve(p.resp);
            this.waiters.splice(i, 1);
          }
      }
    });
  }
  cmd(c, t = 60000) {
    return new Promise((resolve, reject) => {
      const id = String(++this.corrId);
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ corrId: id, cmd: c }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${this.name}: timeout ${c.slice(0, 30)}`));
        }
      }, t);
    });
  }
  waitEvent(match, desc, t = 120000) {
    const f = this.events.find(match);
    if (f) return Promise.resolve(f);
    return new Promise((resolve, reject) => {
      this.waiters.push({ match, resolve });
      setTimeout(() => reject(new Error(`${this.name}: event timeout ${desc}`)), t);
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
  const dirA = path.join(repoRoot, 'runtime', 'test-user-a');
  const dirB = path.join(repoRoot, 'runtime', 'test-user-b');
  for (const d of [dirA, dirB]) {
    rmSync(d, { recursive: true, force: true });
    mkdirSync(d, { recursive: true });
  }
  const A = new Stack('A', dirA);
  const B = new Stack('B', dirB);
  let failures = 0;
  const step = (m) => console.log(`\n=== ${m}`);
  const ok = (m) => console.log(`✓ ${m}`);

  try {
    step('1-2. start both instances (separate data dirs)');
    await A.start();
    await B.start();
    ok('two independent stacks up, sessions established');

    step('3-4. create profile A and profile B (born-encrypted DB)');
    const ca = await A.api('/api/profile/create', { displayName: 'TestUserA', password: PASS_A });
    const cb = await B.api('/api/profile/create', { displayName: 'TestUserB', password: PASS_B });
    if (!ca.body?.ok || !cb.body?.ok) throw new Error('profile create failed');
    ok('both encrypted profiles created');

    step('5-6. one-time invitation A, connect from B');
    await A.openWs();
    await B.openWs();
    const uA = await A.cmd('/u');
    const inv = await A.cmd(`/_connect ${uA.user.userId}`);
    const link = inv.connLinkInvitation?.connFullLink;
    if (!link) throw new Error('no invitation link');
    await B.cmd(`/connect ${link}`);
    const bC = await B.waitEvent((e) => e.type === 'contactConnected', 'B connected');
    const aC = await A.waitEvent((e) => e.type === 'contactConnected', 'A connected');
    ok(`connected (A<->${aC.contact.localDisplayName}, B<->${bC.contact.localDisplayName})`);

    step('7-8. A -> B private canary, received');
    await A.cmd(`/_send @${aC.contact.contactId} text ${CANARY}`);
    await B.waitEvent(
      (e) => e.type === 'newChatItems' && e.chatItems?.[0]?.chatItem?.content?.msgContent?.text === CANARY,
      'B got canary',
    );
    ok('B received the private canary over the SimpleX network');

    step('9. B -> A reply, received');
    await B.cmd(`/_send @${bC.contact.contactId} text ack-from-B`);
    await A.waitEvent(
      (e) => e.type === 'newChatItems' && e.chatItems?.[0]?.chatItem?.content?.msgContent?.text === 'ack-from-B',
      'A got reply',
    );
    ok('A received the reply');

    step('10-11. restart A, history persists (encrypted DB)');
    await A.stop();
    const A2 = new Stack('A2', dirA);
    await A2.start();

    step('12+14. database locked; WRONG password rejected (fail-closed)');
    const wrong = await A2.api('/api/profile/open', { password: 'not-the-password' });
    if (wrong.status !== 403 || wrong.body?.code !== 'wrong-password') throw new Error(`wrong password not rejected: ${wrong.status}`);
    ok('wrong password rejected — database stays locked');

    step('13. CORRECT password opens; cronologia intatta');
    const open = await A2.api('/api/profile/open', { password: PASS_A });
    if (!open.body?.ok) throw new Error('reopen failed');
    await A2.openWs();
    const hist = await A2.cmd(`/_get chat @${aC.contact.contactId} count=10`);
    const texts = (hist.chat?.chatItems ?? []).map((i) => i.content?.msgContent?.text).filter(Boolean);
    if (!texts.includes(CANARY) || !texts.includes('ack-from-B')) throw new Error(`history incomplete: ${JSON.stringify(texts)}`);
    ok('unlocked with the correct password — full history restored');

    step('18. reconnection (WS drop + reconnect)');
    A2.ws.close();
    await A2.openWs();
    const uAgain = await A2.cmd('/u');
    if (uAgain.type !== 'activeUser') throw new Error('reconnect failed');
    ok('reconnected and the core is responsive');

    await A2.stop();
    console.log('\nTWO-USER TEST: PASS');
    console.log('(media: see tests/e2e/ui-attachments.mjs; runtime/test-user-* left for canary-scan)');
  } catch (err) {
    console.error(`✗ FAIL: ${err.message}`);
    failures = 1;
  } finally {
    await A.stop().catch(() => undefined);
    await B.stop().catch(() => undefined);
  }
  process.exit(failures);
}

main();

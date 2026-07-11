#!/usr/bin/env node
/**
 * network-egress.mjs — verifies WHO talks to the network.
 *
 * Boots one full FWA stack, creates a profile (so the core subscribes to its
 * relays), then samples TCP connections of every process in the stack for a
 * while and asserts:
 *   1. the launcher/bridge (node) has NO non-loopback connections at all;
 *   2. only the simplex-chat core opens remote connections;
 *   3. every remote endpoint the core talks to belongs to the relay hosts the
 *      core itself reports via /_servers (resolved to IPs), and nothing else —
 *      in particular nothing resolving to Google/Meta/AWS-hosted analytics.
 *
 * macOS/Linux (uses lsof). Run: node tests/security/network-egress.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const launcherEntry = path.join(repoRoot, 'apps', 'launcher', 'dist', 'index.js');
const profileDir = path.join(repoRoot, 'runtime', 'profiles', 'egress-test');

const SAMPLE_SECONDS = 45;

function lsofTcp(pid) {
  try {
    const out = execFileSync('lsof', ['-nP', '-a', '-iTCP', '-p', String(pid)], { timeout: 10000 }).toString();
    return out
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/(\S+):(\d+)->(\S+):(\d+)/);
        return m ? { remoteIp: m[3], remotePort: m[4] } : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip.startsWith('[::1]');

async function main() {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });

  const child = spawn('node', [launcherEntry], {
    cwd: repoRoot,
    env: { ...process.env, FWA_ROOT: repoRoot, FWA_PROFILE_DIR: profileDir, FWA_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  let failures = 0;
  const fail = (msg) => {
    console.error(`✗ ${msg}`);
    failures += 1;
  };

  try {
    const url = await new Promise((resolve, reject) => {
      let buf = '';
      const t = setTimeout(() => reject(new Error('launcher URL timeout')), 30000);
      child.stdout.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/#b=[\w-]+/);
        if (m) {
          clearTimeout(t);
          resolve(m[0]);
        }
      });
    });
    const origin = new URL(url).origin;
    const bootstrap = url.split('#b=')[1];
    const sess = await fetch(`${origin}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ bootstrap }),
    });
    const cookie = sess.headers.get('set-cookie').split(';')[0];
    const create = await fetch(`${origin}/api/profile/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
      body: JSON.stringify({ displayName: 'EgressProbe', password: 'egress-probe-passphrase-1!' }),
    });
    if (create.status !== 200) throw new Error(`profile create failed ${create.status}`);
    console.log('stack up, core running — sampling connections…');

    // Ask the core which servers it is configured to use.
    const ws = new WebSocket(`${origin.replace('http', 'ws')}/api/ws`, {
      headers: { Origin: origin, Cookie: cookie },
    });
    await new Promise((res, rej) => {
      ws.once('open', res);
      ws.once('error', rej);
    });
    const servers = await new Promise((resolve, reject) => {
      ws.on('message', (d) => {
        const p = JSON.parse(d.toString());
        if (p.corrId === 's') resolve(p.resp);
      });
      ws.send(JSON.stringify({ corrId: 's', cmd: '/_servers 1' }));
      setTimeout(() => reject(new Error('servers timeout')), 20000);
    });
    const relayHosts = new Set();
    for (const group of servers.userServers ?? []) {
      for (const s of [...(group.smpServers ?? []), ...(group.xftpServers ?? [])]) {
        for (const part of s.server.split('@').pop().split(',')) {
          const host = part.split(':')[0].split('/')[0];
          if (host && !host.endsWith('.onion')) relayHosts.add(host);
        }
      }
    }
    console.log(`core reports ${relayHosts.size} relay hostnames`);
    const relayIps = new Set();
    for (const host of relayHosts) {
      try {
        for (const a of await lookup(host, { all: true })) relayIps.add(a.address);
      } catch {
        /* offline host — fine */
      }
    }

    // Find the simplex-chat PID (child of the launcher).
    const psOut = execFileSync('ps', ['-axo', 'pid,ppid,comm']).toString();
    const corePids = psOut
      .split('\n')
      .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .filter((m) => m && m[3].includes('simplex-chat'))
      .map((m) => Number(m[1]));
    if (corePids.length === 0) fail('could not find simplex-chat process');

    const launcherRemote = new Set();
    const coreRemote = new Set();
    const deadline = Date.now() + SAMPLE_SECONDS * 1000;
    while (Date.now() < deadline) {
      for (const conn of lsofTcp(child.pid)) if (!isLoopback(conn.remoteIp)) launcherRemote.add(conn.remoteIp);
      for (const pid of corePids) for (const conn of lsofTcp(pid)) if (!isLoopback(conn.remoteIp)) coreRemote.add(`${conn.remoteIp}:${conn.remotePort}`);
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`\nlauncher non-loopback connections: ${launcherRemote.size}`);
    if (launcherRemote.size > 0) fail(`launcher/bridge contacted remote hosts: ${[...launcherRemote].join(', ')}`);
    else console.log('✓ launcher/bridge: loopback only — our code never touches the network');

    console.log(`core remote endpoints observed: ${coreRemote.size}`);
    const unknown = [...coreRemote].filter((e) => !relayIps.has(e.split(':')[0]));
    if (unknown.length > 0) fail(`core contacted endpoints outside its configured relays: ${unknown.join(', ')}`);
    else console.log('✓ core: every remote endpoint belongs to its configured SimpleX relays');

    ws.close();
  } catch (err) {
    fail(err.message);
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 2000));
    rmSync(profileDir, { recursive: true, force: true });
  }

  console.log(failures === 0 ? '\nNETWORK EGRESS TEST: PASS' : `\nNETWORK EGRESS TEST: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

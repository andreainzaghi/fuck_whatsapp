/**
 * SimpleX core process management.
 *
 * Security invariants enforced here:
 *  - core stdout/stderr are IGNORED at the OS level ('ignore'): the CLI echoes
 *    received commands (which contain plaintext) to stdout, so nothing from
 *    those streams may ever enter our process or any log (verified fact,
 *    docs/SIMPLEX_INTEGRATION.md §7).
 *  - stdin stays open for the core's whole life (EOF kills it) and is used
 *    exactly once: to answer the first-run display-name prompt, keeping the
 *    display name out of the process argument list.
 *  - The database passphrase must be passed as `-k` (the only method the CLI
 *    supports, see docs/KNOWN_LIMITATIONS.md). The variable holding it is
 *    cleared as soon as the spawn call returns.
 *  - The core is always started in the profile directory sandbox with its own
 *    files/ and tmp/ folders, chat server on a random loopback port.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { WebSocket } from 'ws';
import type { Logger } from '@fwa/simplex-bridge';

export interface CoreSpawnConfig {
  binPath: string;
  dbPrefix: string;
  corePort: number;
  filesDir: string;
  tmpDir: string;
  deviceName: string;
  socksProxy?: string | undefined;
  /**
   * Extra directory to prepend to the dynamic-library search path when spawning
   * the core. On macOS the packaged app ships its own openssl@3.0 dylibs here so
   * the pristine SimpleX binary resolves them without any system install (and
   * without modifying the binary, keeping its SHA-256 intact).
   */
  libDir?: string | undefined;
  logger: Logger;
}

export interface CoreHandle {
  child: ChildProcess;
  /** Resolves when the core WS answers /u with an active user. */
  ready: Promise<{ coreVersion: string }>;
  stop(): Promise<void>;
  isAlive(): boolean;
}

export type SpawnMode =
  | { kind: 'create'; displayName: string; key: string }
  | { kind: 'open'; key: string };

const READY_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 300;

export function spawnCore(cfg: CoreSpawnConfig, mode: SpawnMode): CoreHandle {
  const args = [
    '-d', cfg.dbPrefix,
    '-p', String(cfg.corePort),
    '-l', 'error',
    '-y',
    '--files-folder', cfg.filesDir,
    '--temp-folder', cfg.tmpDir,
    '--device-name', cfg.deviceName,
    '--auto-accept-files', String(5 * 1024 * 1024),
    '-k', mode.key,
  ];
  if (mode.kind === 'open') args.push('-m');
  if (cfg.socksProxy) args.push('--socks-proxy', cfg.socksProxy);

  // Point dyld/ld at the bundled openssl dylibs when packaged (macOS/Linux).
  // DYLD_LIBRARY_PATH / LD_LIBRARY_PATH are searched by leaf name and take
  // precedence over the binary's recorded install path, so the pristine binary
  // finds our copies without being modified.
  const env = { ...process.env };
  if (cfg.libDir) {
    if (process.platform === 'darwin') {
      env['DYLD_LIBRARY_PATH'] = [cfg.libDir, process.env['DYLD_LIBRARY_PATH']].filter(Boolean).join(':');
    } else if (process.platform === 'linux') {
      env['LD_LIBRARY_PATH'] = [cfg.libDir, process.env['LD_LIBRARY_PATH']].filter(Boolean).join(':');
    }
  }

  const child = spawn(cfg.binPath, args, {
    // stdout/stderr: 'ignore' — see security invariants above.
    stdio: ['pipe', 'ignore', 'ignore'],
    detached: false,
    env,
  });
  // Drop FWA's own retained copies of the passphrase-bearing argv as soon as
  // the OS has the arguments. The kernel process table still exposes -k (the
  // documented limitation, docs/KNOWN_LIMITATIONS.md), but we do not keep a
  // second copy alive inside the launcher's heap for the whole session.
  args.fill('');
  try {
    (child as { spawnargs?: string[] }).spawnargs = [];
  } catch {
    /* best effort */
  }
  cfg.logger.log('core', 'spawn');

  // Answer the first-run display-name prompt. The CLI reads the line when it
  // is ready; until then it sits in the pipe buffer. In 'open' mode nothing
  // is written but the pipe MUST stay open (EOF terminates the core).
  // Guard the write: if the core dies before reading (e.g. corrupt DB), the
  // stdin pipe emits EPIPE — swallow it so the launcher does not crash.
  child.stdin?.on('error', () => {
    /* core closed stdin early; handled via the exit path */
  });
  if (mode.kind === 'create' && child.stdin && child.stdin.writable) {
    child.stdin.write(mode.displayName + '\n');
  }

  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  const ready = (async (): Promise<{ coreVersion: string }> => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    // Wait for the WS server to accept connections.
    while (Date.now() < deadline) {
      if (exited) throw new CoreExitedError();
      const ok = await tryOnce(cfg.corePort);
      if (ok !== null) {
        // In maintenance mode chat must be started explicitly. A failure HERE
        // means the database opened successfully (WS answered /u) but chat
        // could not start — this is NOT a wrong-password condition, so raise a
        // distinct error the launcher will not misreport as bad credentials.
        if (mode.kind === 'open') {
          const started = await wsCommand(cfg.corePort, '/_start');
          if (started === null) throw new CoreStartFailedError();
        }
        cfg.logger.log('core', 'ready');
        return { coreVersion: ok };
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new CoreTimeoutError();
  })();

  return {
    child,
    ready,
    isAlive: () => !exited,
    async stop() {
      if (exited) return;
      child.kill('SIGTERM');
      const gone = await Promise.race([
        new Promise<boolean>((resolve) => child.once('exit', () => resolve(true))),
        sleep(5000).then(() => false),
      ]);
      if (!gone) child.kill('SIGKILL');
      cfg.logger.log('core', 'exit_clean');
    },
  };
}

export class CoreExitedError extends Error {
  constructor() {
    super('core-exited');
  }
}
export class CoreTimeoutError extends Error {
  constructor() {
    super('core-timeout');
  }
}
/** DB opened fine but `/_start` failed — distinct from wrong-password. */
export class CoreStartFailedError extends Error {
  constructor() {
    super('core-start-failed');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Single-shot probe: connect, ask /u and /version, resolve with the core
 * version when an active user exists. Resolves null when the port is not
 * accepting yet.
 */
async function tryOnce(port: number): Promise<string | null> {
  const user = await wsCommand(port, '/u');
  if (user === null) return null;
  if (user['type'] !== 'activeUser') return null;
  const v = await wsCommand(port, '/version');
  const version =
    v && typeof v['versionInfo'] === 'object' && v['versionInfo'] !== null
      ? String((v['versionInfo'] as Record<string, unknown>)['version'] ?? 'unknown')
      : 'unknown';
  return version;
}

/** Fire one command on a throwaway WS connection; null if unreachable. */
function wsCommand(port: number, cmd: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.terminate();
      resolve(null);
    }, 10_000);
    ws.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({ corrId: 'probe', cmd }));
    });
    ws.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString('utf8')) as { corrId?: string; resp?: Record<string, unknown> };
        if (parsed.corrId === 'probe' && parsed.resp) {
          clearTimeout(timer);
          ws.close();
          resolve(parsed.resp);
        }
      } catch {
        /* ignore non-JSON frames */
      }
    });
  });
}

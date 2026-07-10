/**
 * FWA launcher — the single local process a user runs.
 *
 *  1. verifies the SimpleX binary is present (and its version);
 *  2. picks two random loopback ports (bridge + core);
 *  3. mints a fresh one-time bootstrap code (new at every start);
 *  4. serves the built frontend + authenticated bridge on 127.0.0.1;
 *  5. spawns / supervises the SimpleX core on demand (onboarding-driven);
 *  6. opens the browser;
 *  7. tears everything down (core included) on exit.
 *
 * It never decrypts, stores or logs message content. SimpleX is the only
 * source of chat data.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createBridge, createLogger, type CoreController } from '@fwa/simplex-bridge';
import type { ApiError, CoreStatus, StatusResponse } from '@fwa/shared-types';
import { CoreExitedError, CoreStartFailedError, spawnCore, type CoreHandle } from './core-process.js';

const execFileP = promisify(execFile);
const EXPECTED_VERSION_PREFIX = 'SimpleX Chat v6.5.6';

/**
 * Launch-time integrity gate (defense in depth for the "substituted SimpleX
 * binary" threat, docs/THREAT_MODEL.md). install-simplex.mjs records the
 * verified SHA-256 in runtime/bin/simplex-chat.sha256; we re-check it here
 * before ever executing the binary, so a binary swapped AFTER install is
 * refused rather than run.
 */
function verifyBinaryIntegrity(binPath: string, manifestPath: string): boolean {
  if (!existsSync(manifestPath)) return false;
  const recorded = readFileSync(manifestPath, 'utf8').trim().split(/\s+/)[0];
  if (!recorded || recorded.length !== 64) return false;
  const actual = createHash('sha256').update(readFileSync(binPath)).digest('hex');
  return actual === recorded;
}

function openProbe(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function probePort(srv: Server): number {
  const address = srv.address();
  if (address === null || typeof address === 'string') throw new Error('no-port');
  return address.port;
}

/** Reserve two distinct loopback ports, holding both probes open at once so
 * they can never be assigned the same port. */
async function reserveTwoPorts(): Promise<[number, number]> {
  const a = await openProbe();
  const b = await openProbe();
  const ports: [number, number] = [probePort(a), probePort(b)];
  await new Promise<void>((r) => a.close(() => r()));
  await new Promise<void>((r) => b.close(() => r()));
  return ports;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(cmd, args, () => {
    /* non-fatal: the URL is printed to the terminal as fallback */
  });
}

/** True when running as a packaged Node Single Executable Application. */
async function isPackaged(): Promise<boolean> {
  try {
    const sea = (await import('node:sea')) as { isSea?: () => boolean };
    return sea.isSea?.() ?? false;
  } catch {
    return false;
  }
}

/** Directory holding the bundled resources (web/, bin/) next to the app. */
function resourcesDir(): string {
  const exeDir = path.dirname(process.execPath);
  // macOS .app bundle: .../Contents/MacOS/<exe> -> .../Contents/Resources
  if (process.platform === 'darwin' && path.basename(exeDir) === 'MacOS') {
    return path.join(path.dirname(exeDir), 'Resources');
  }
  // portable (win/linux): resources/ sibling of the executable
  return path.join(exeDir, 'resources');
}

/** OS-standard per-user application data directory (never beside the exe). */
function appDataDir(): string {
  const home = homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Fuck WhatsApp');
  if (process.platform === 'win32') return path.join(process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming'), 'Fuck WhatsApp');
  return path.join(process.env['XDG_DATA_HOME'] ?? path.join(home, '.local', 'share'), 'fuck-whatsapp');
}

async function main(): Promise<void> {
  const logger = createLogger();
  const packaged = await isPackaged();
  const exeName = process.platform === 'win32' ? 'simplex-chat.exe' : 'simplex-chat';
  const repoRoot = process.env['FWA_ROOT'] ?? process.cwd();
  const res = packaged ? resourcesDir() : repoRoot;

  // Env overrides always win (tests, advanced users), then packaged layout,
  // then the dev/repo layout.
  const binPath =
    process.env['FWA_SIMPLEX_BIN'] ??
    (packaged ? path.join(res, 'bin', exeName) : path.join(repoRoot, 'runtime', 'bin', 'simplex-chat'));
  const profileDir =
    process.env['FWA_PROFILE_DIR'] ??
    (packaged ? path.join(appDataDir(), 'profile') : path.join(repoRoot, 'runtime', 'profiles', 'default'));
  const webRoot =
    process.env['FWA_WEB_ROOT'] ?? (packaged ? path.join(res, 'web') : path.join(repoRoot, 'apps', 'web', 'dist'));
  const socksProxy = process.env['FWA_SOCKS_PROXY'] || undefined;
  // Bundled dynamic libraries (macOS/Linux packaged app): see core-process.ts.
  const libDir = process.env['FWA_LIB_DIR'] ?? (packaged ? path.join(res, 'lib') : undefined);

  if (!existsSync(binPath)) {
    process.stderr.write('SimpleX binary not found. Run: npm run setup\n');
    process.exit(1);
  }
  if (!existsSync(path.join(webRoot, 'index.html'))) {
    process.stderr.write('Frontend build not found. Run: npm run build\n');
    process.exit(1);
  }

  // Integrity gate BEFORE the binary is ever executed: re-check the SHA-256
  // recorded at build/install time. A binary swapped afterwards is refused.
  // Look for "<bin>.sha256" first, then a sibling "simplex-chat.sha256".
  const manifestPath = existsSync(`${binPath}.sha256`)
    ? `${binPath}.sha256`
    : path.join(path.dirname(binPath), 'simplex-chat.sha256');
  if (!verifyBinaryIntegrity(binPath, manifestPath)) {
    process.stderr.write('SimpleX binary integrity check FAILED (sha256 mismatch or missing manifest). Run: npm run setup\n');
    process.exit(1);
  }

  // Version check (short-lived exec; output is a fixed banner, no user data).
  try {
    const { stdout } = await execFileP(binPath, ['--version'], { timeout: 20_000 });
    if (!stdout.startsWith(EXPECTED_VERSION_PREFIX)) {
      process.stderr.write(`Unexpected SimpleX version (expected ${EXPECTED_VERSION_PREFIX}*). Run: npm run verify\n`);
      process.exit(1);
    }
  } catch {
    process.stderr.write('SimpleX binary failed to execute. On macOS: brew install openssl@3.0. Run: npm run verify\n');
    process.exit(1);
  }

  const dbPrefix = path.join(profileDir, 'simplex_v1');
  const filesDir = path.join(profileDir, 'files');
  const tmpDir = path.join(profileDir, 'tmp');
  const stagingDir = path.join(profileDir, 'staging');
  await mkdir(filesDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });
  await mkdir(stagingDir, { recursive: true });

  // Reserve BOTH ports while holding BOTH probe sockets open, so they cannot
  // alias each other, then release just before the real servers bind.
  const [bridgePort, corePort] = await reserveTwoPorts();

  /* ----------------------- core state machine ----------------------- */
  let core: CoreHandle | null = null;
  let coreStatus: CoreStatus = existsSync(`${dbPrefix}_chat.db`) ? 'locked' : 'no-profile';
  let coreVersion: string | null = null;
  let errorCode: string | null = null;
  const startedAt = Date.now();

  const dbExists = (): boolean => existsSync(`${dbPrefix}_chat.db`);

  async function bringUp(mode: { kind: 'create'; displayName: string; key: string } | { kind: 'open'; key: string }): Promise<{ ok: boolean; code?: ApiError['code'] }> {
    if (core?.isAlive()) return { ok: false, code: 'core-already-running' };
    coreStatus = 'starting';
    errorCode = null;
    const handle = spawnCore(
      { binPath, dbPrefix, corePort, filesDir, tmpDir, deviceName: 'FWA', socksProxy, libDir, logger },
      mode,
    );
    core = handle;
    // Passphrase reference is not retained by us beyond this point.
    handle.child.once('exit', () => {
      if (coreStatus === 'running') {
        // Unexpected death after successful start.
        coreStatus = dbExists() ? 'locked' : 'no-profile';
        errorCode = 'core-exited';
        logger.log('core', 'exit_error');
      }
    });
    try {
      const { coreVersion: v } = await handle.ready;
      coreVersion = v;
      coreStatus = 'running';
      return { ok: true };
    } catch (err) {
      await handle.stop().catch(() => undefined);
      core = null;
      if (err instanceof CoreExitedError && mode.kind === 'open') {
        // Encrypted DB + wrong key exits almost immediately (fail-closed).
        coreStatus = 'wrong-password';
        logger.log('core', 'exit_wrong_key');
        return { ok: false, code: 'wrong-password' };
      }
      coreStatus = 'error';
      errorCode = err instanceof Error ? err.message : 'unknown';
      logger.log('core', 'exit_error');
      return { ok: false, code: 'internal' };
    }
  }

  // Forward reference so the controller can trigger the clean shutdown that is
  // defined below.
  let triggerShutdown: (() => void) | null = null;

  const controller: CoreController = {
    getStatus(): StatusResponse {
      return {
        coreStatus,
        coreVersion,
        errorCode,
        uptimeMs: Date.now() - startedAt,
      };
    },
    async createProfile(displayName, password) {
      if (dbExists()) return { ok: false, code: 'profile-exists' };
      return bringUp({ kind: 'create', displayName, key: password });
    },
    async openProfile(password) {
      if (!dbExists()) return { ok: false, code: 'bad-request' };
      return bringUp({ kind: 'open', key: password });
    },
    getCorePort() {
      return core?.isAlive() && coreStatus === 'running' ? corePort : null;
    },
    requestShutdown() {
      triggerShutdown?.();
    },
  };

  const bridge = await createBridge({
    port: bridgePort,
    webRoot,
    areas: { filesDir, stagingDir },
    controller,
    logger,
  });

  // The bootstrap URL is shown once on the interactive terminal (never written
  // to a file); the code inside is single-use and expires in 5 minutes.
  process.stdout.write('\nFWA CHAT — local, end-to-end encrypted by the SimpleX core\n');
  process.stdout.write(`\n  Open:  ${bridge.launchUrl}\n\n`);
  if (!process.env['FWA_NO_OPEN']) openBrowser(bridge.launchUrl);

  let shuttingDown = false;
  const shutdown = async (code = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log('launcher', 'shutdown');
    await bridge.close().catch(() => undefined);
    await core?.stop().catch(() => undefined);
    process.exit(code);
  };
  triggerShutdown = () => void shutdown();
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGHUP', () => void shutdown());
  // Last-resort synchronous kill so a crash never orphans a running core
  // (which holds the decrypted database open). Async cleanup cannot run on
  // 'exit', so SIGTERM the child directly.
  process.on('exit', () => {
    try {
      core?.child.kill('SIGTERM');
    } catch {
      /* nothing more we can do at exit */
    }
  });
  process.on('uncaughtException', () => void shutdown(1));
  process.on('unhandledRejection', () => void shutdown(1));
}

main().catch(() => {
  process.stderr.write('launcher failed to start\n');
  process.exit(1);
});

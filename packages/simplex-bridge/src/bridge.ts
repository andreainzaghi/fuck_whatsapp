/**
 * The local bridge: a single http.Server bound to 127.0.0.1 that
 *  - serves the built frontend with a restrictive CSP,
 *  - exposes the authenticated /api/* endpoints,
 *  - upgrades /api/ws into an authenticated proxy to the SimpleX core.
 *
 * It holds NO chat state and NO parallel database: the SimpleX core is the
 * only source of chat data.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Socket } from 'node:net';
import {
  BRIDGE_LIMITS,
  BRIDGE_ROUTES,
  SESSION_COOKIE,
  type ApiError,
  type ProfileCreateRequest,
  type ProfileOpenRequest,
  type StatusResponse,
} from '@fwa/shared-types';
import { createAuth, readSessionCookie, sessionCookieValue, type AuthState } from './auth.js';
import { createRateLimiter, isLoopbackSocket, isValidHost, isValidOrigin, readBodyCapped } from './guards.js';
import { cleanStaging, deleteStagedFile, ensureAreas, serveConfinedFile, stageUpload, type FileAreas } from './files.js';
import { createWsProxy, type WsProxy } from './wsProxy.js';
import type { Logger } from './log.js';

/** Implemented by the launcher: process management stays out of the bridge. */
export interface CoreController {
  getStatus(): StatusResponse;
  createProfile(displayName: string, password: string): Promise<{ ok: boolean; code?: ApiError['code'] }>;
  openProfile(password: string): Promise<{ ok: boolean; code?: ApiError['code'] }>;
  /** Port of the core WS once running, else null. */
  getCorePort(): number | null;
  /** "Lock and close": stop the core, then tear down and exit cleanly. */
  requestShutdown?(): void;
}

export interface BridgeOptions {
  port: number;
  webRoot: string;
  areas: FileAreas;
  controller: CoreController;
  logger: Logger;
}

export interface Bridge {
  server: Server;
  auth: AuthState;
  /** URL the launcher opens in the browser (contains the one-time code). */
  launchUrl: string;
  close(): Promise<void>;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  // Defense in depth: even a JSON response gets a locked-down CSP and
  // anti-framing headers, so it can never be repurposed as an HTML/JS sink.
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
} as const;

function sendJson(res: ServerResponse, code: number, body: unknown, extraHeaders?: Record<string, string>): void {
  res.writeHead(code, { ...JSON_HEADERS, ...extraHeaders });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, httpCode: number, code: ApiError['code']): void {
  sendJson(res, httpCode, { ok: false, code } satisfies ApiError);
}

function securityHeaders(port: number): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "style-src-attr 'unsafe-inline'", // React style attributes only; no <style> injection, no external sheets
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      `connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}`,
      "font-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "manifest-src 'self'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
  };
}

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

async function serveStatic(webRoot: string, urlPath: string, res: ServerResponse, port: number): Promise<void> {
  // hash-routing SPA: anything without a known extension gets index.html
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  if (!path.posix.extname(rel)) rel = '/index.html';
  const normalized = path.posix.normalize(rel);
  if (normalized.includes('..')) {
    res.writeHead(400).end();
    return;
  }
  const abs = path.join(webRoot, normalized);
  if (!abs.startsWith(path.resolve(webRoot) + path.sep)) {
    res.writeHead(400).end();
    return;
  }
  let info;
  try {
    info = await stat(abs);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    return;
  }
  if (!info.isFile()) {
    res.writeHead(404).end();
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  const immutable = normalized.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': STATIC_MIME[ext] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    ...securityHeaders(port),
  });
  createReadStream(abs).pipe(res);
}

export async function createBridge(opts: BridgeOptions): Promise<Bridge> {
  const { port, webRoot, areas, controller, logger } = opts;
  await ensureAreas(areas);

  const auth = createAuth();
  // Rate limiters are intentionally keyed globally (one bucket per endpoint
  // class), not per-client: this is a single-user, loopback-only bridge, so
  // there is no legitimate second client to isolate. The buckets exist to blunt
  // runaway loops and local abuse, and the cookie still gates every route but
  // /api/session. See docs/THREAT_MODEL.md (co-resident local process).
  const sessionLimiter = createRateLimiter(10, 60_000);
  const uploadLimiter = createRateLimiter(30, 60_000);
  const fileLimiter = createRateLimiter(240, 60_000);
  const apiLimiter = createRateLimiter(120, 60_000);

  let wsProxy: WsProxy | null = null;

  const isAuthed = (req: IncomingMessage): boolean =>
    auth.isValidSession(readSessionCookie(req.headers.cookie, SESSION_COOKIE));

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      logger.log('bridge', 'internal_error');
      if (!res.headersSent) sendError(res, 500, 'internal');
      else res.end();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Perimeter: loopback socket + strict Host on EVERY request.
    if (!isLoopbackSocket(req)) {
      req.destroy();
      return;
    }
    if (!isValidHost(req, { port })) {
      logger.log('auth', 'auth_fail_host');
      sendError(res, 403, 'bad-origin');
      return;
    }

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const route = url.pathname;

    /* ---------------- unauthenticated: session exchange ---------------- */
    if (route === BRIDGE_ROUTES.session && req.method === 'POST') {
      if (!isValidOrigin(req, { port }, true)) {
        logger.log('auth', 'auth_fail_origin');
        sendError(res, 403, 'bad-origin');
        return;
      }
      if (!sessionLimiter.hit('session')) {
        logger.log('auth', 'rate_limited');
        sendError(res, 429, 'rate-limited');
        return;
      }
      const body = await readBodyCapped(req, 4096);
      if (body === 'too-large') {
        sendError(res, 413, 'payload-too-large');
        return;
      }
      let bootstrap = '';
      try {
        bootstrap = String((JSON.parse(body.toString('utf8')) as Record<string, unknown>)['bootstrap'] ?? '');
      } catch {
        sendError(res, 400, 'bad-request');
        return;
      }
      if (!auth.consumeBootstrap(bootstrap)) {
        logger.log('auth', 'bootstrap_rejected');
        sendError(res, 403, 'bad-bootstrap');
        return;
      }
      const token = auth.createSession();
      logger.log('auth', 'session_created');
      sendJson(res, 200, { ok: true, status: controller.getStatus() }, { 'Set-Cookie': sessionCookieValue(SESSION_COOKIE, token) });
      return;
    }

    /* ---------------- static frontend (loopback-only shell) ------------ */
    if (!route.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendError(res, 405, 'bad-request');
        return;
      }
      await serveStatic(webRoot, route, res, port);
      return;
    }

    /* ---------------- everything below requires the session ------------ */
    if (!isAuthed(req)) {
      logger.log('auth', 'auth_fail_token');
      sendError(res, 401, 'unauthorized');
      return;
    }
    // Origin: required on state-changing methods; when present must be local.
    const stateChanging = req.method !== 'GET' && req.method !== 'HEAD';
    if (!isValidOrigin(req, { port }, stateChanging)) {
      logger.log('auth', 'auth_fail_origin');
      sendError(res, 403, 'bad-origin');
      return;
    }

    if (route === BRIDGE_ROUTES.status && req.method === 'GET') {
      if (!apiLimiter.hit('api')) {
        sendError(res, 429, 'rate-limited');
        return;
      }
      sendJson(res, 200, controller.getStatus());
      return;
    }

    if (route === BRIDGE_ROUTES.shutdown && req.method === 'POST') {
      // "Lock and close": acknowledge, then trigger the launcher's clean
      // shutdown on the next tick so the response is delivered first.
      sendJson(res, 200, { ok: true });
      logger.log('launcher', 'shutdown');
      setTimeout(() => controller.requestShutdown?.(), 50);
      return;
    }

    if (route === BRIDGE_ROUTES.profileCreate && req.method === 'POST') {
      if (!apiLimiter.hit('api')) {
        sendError(res, 429, 'rate-limited');
        return;
      }
      const body = await readBodyCapped(req, 8192);
      if (body === 'too-large') {
        sendError(res, 413, 'payload-too-large');
        return;
      }
      let parsed: ProfileCreateRequest;
      try {
        parsed = JSON.parse(body.toString('utf8')) as ProfileCreateRequest;
      } catch {
        sendError(res, 400, 'bad-request');
        return;
      }
      const name = typeof parsed.displayName === 'string' ? parsed.displayName.trim() : '';
      const password = typeof parsed.password === 'string' ? parsed.password : '';
      // Reject control chars and leading '/' or '@' (SimpleX display-name syntax).
      if (name.length < 1 || name.length > 50 || /[\p{Cc}\p{Cf}]/u.test(name) || /^[/@#\s]/.test(name)) {
        sendError(res, 400, 'bad-request');
        return;
      }
      if (password.length < BRIDGE_LIMITS.minPasswordLength || password.length > 256) {
        sendError(res, 400, 'weak-password');
        return;
      }
      const result = await controller.createProfile(name, password);
      if (result.ok) sendJson(res, 200, { ok: true, status: controller.getStatus() });
      else sendError(res, 409, result.code ?? 'internal');
      return;
    }

    if (route === BRIDGE_ROUTES.profileOpen && req.method === 'POST') {
      if (!apiLimiter.hit('api')) {
        sendError(res, 429, 'rate-limited');
        return;
      }
      const body = await readBodyCapped(req, 8192);
      if (body === 'too-large') {
        sendError(res, 413, 'payload-too-large');
        return;
      }
      let parsed: ProfileOpenRequest;
      try {
        parsed = JSON.parse(body.toString('utf8')) as ProfileOpenRequest;
      } catch {
        sendError(res, 400, 'bad-request');
        return;
      }
      const password = typeof parsed.password === 'string' ? parsed.password : '';
      if (password.length < 1 || password.length > 256) {
        sendError(res, 400, 'bad-request');
        return;
      }
      const result = await controller.openProfile(password);
      if (result.ok) sendJson(res, 200, { ok: true, status: controller.getStatus() });
      else sendError(res, result.code === 'wrong-password' ? 403 : 409, result.code ?? 'internal');
      return;
    }

    if (route === BRIDGE_ROUTES.upload && req.method === 'POST') {
      if (!uploadLimiter.hit('upload')) {
        logger.log('files', 'rate_limited');
        sendError(res, 429, 'rate-limited');
        return;
      }
      const body = await readBodyCapped(req, BRIDGE_LIMITS.maxUploadBytes);
      if (body === 'too-large') {
        logger.log('files', 'payload_too_large');
        sendError(res, 413, 'payload-too-large');
        return;
      }
      if (body.length === 0) {
        sendError(res, 400, 'bad-request');
        return;
      }
      const suggested = typeof req.headers['x-fwa-filename'] === 'string' ? req.headers['x-fwa-filename'] : undefined;
      const staged = await stageUpload(areas, suggested, body);
      if (staged === 'staging-full') {
        logger.log('files', 'upload_rejected');
        sendError(res, 507, 'payload-too-large');
        return;
      }
      logger.log('files', 'upload_ok');
      sendJson(res, 200, { ok: true, absPath: staged.absPath, size: staged.size });
      return;
    }

    if (route === BRIDGE_ROUTES.file && req.method === 'GET') {
      if (!fileLimiter.hit('file')) {
        sendError(res, 429, 'rate-limited');
        return;
      }
      const requested = url.searchParams.get('path') ?? '';
      const served = await serveConfinedFile(areas, requested, res);
      if (!served) {
        logger.log('files', 'file_denied');
        if (!res.headersSent) sendError(res, 404, 'bad-request');
      }
      return;
    }

    if (route === BRIDGE_ROUTES.file && req.method === 'DELETE') {
      if (!apiLimiter.hit('api')) {
        sendError(res, 429, 'rate-limited');
        return;
      }
      const requested = url.searchParams.get('path') ?? '';
      const deleted = await deleteStagedFile(areas, requested);
      if (deleted) sendJson(res, 200, { ok: true });
      else {
        logger.log('files', 'file_denied');
        sendError(res, 404, 'bad-request');
      }
      return;
    }

    logger.log('bridge', 'not_found');
    sendError(res, 404, 'bad-request');
  }

  /* ------------------- WebSocket upgrade (authenticated) --------------- */
  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const fail = (code: 'auth_fail_host' | 'auth_fail_origin' | 'auth_fail_token' | 'ws_core_unreachable') => {
      logger.log('auth', code === 'ws_core_unreachable' ? 'ws_core_unreachable' : code);
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
    };
    if (!isLoopbackSocket(req)) {
      socket.destroy();
      return;
    }
    if (url.pathname !== BRIDGE_ROUTES.ws) {
      socket.destroy();
      return;
    }
    if (!isValidHost(req, { port })) return fail('auth_fail_host');
    if (!isValidOrigin(req, { port }, true)) return fail('auth_fail_origin');
    if (!isAuthed(req)) return fail('auth_fail_token');
    const corePort = controller.getCorePort();
    if (corePort === null) return fail('ws_core_unreachable');
    if (!wsProxy) {
      wsProxy = createWsProxy({
        corePort,
        maxFrameBytes: BRIDGE_LIMITS.maxWsFrameBytes,
        messagesPer10s: BRIDGE_LIMITS.wsMessagesPer10s,
        logger,
      });
    }
    wsProxy.handleUpgrade(req, socket, head);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // SECURITY: bind loopback explicitly. Never 0.0.0.0.
    server.listen(port, '127.0.0.1', () => resolve());
  });
  logger.log('bridge', 'listen');

  return {
    server,
    auth,
    launchUrl: `http://127.0.0.1:${port}/#b=${auth.bootstrapCode}`,
    async close() {
      wsProxy?.closeAll();
      await cleanStaging(areas);
      logger.log('files', 'staging_cleaned');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.log('bridge', 'shutdown');
    },
  };
}

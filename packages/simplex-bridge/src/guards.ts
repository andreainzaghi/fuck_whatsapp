/**
 * Request guards: strict loopback Origin/Host validation, sliding-window rate
 * limiting and payload caps. These run before any handler logic.
 */
import type { IncomingMessage } from 'node:http';

export interface GuardConfig {
  /** The exact port the bridge listens on. */
  port: number;
}

/** Hosts we accept — the bridge binds 127.0.0.1 only, so only these appear. */
function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
}

function allowedOrigins(port: number): Set<string> {
  return new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]);
}

/**
 * Host header check — defeats DNS rebinding: a page at attacker.example that
 * resolves to 127.0.0.1 still sends `Host: attacker.example`.
 */
export function isValidHost(req: IncomingMessage, cfg: GuardConfig): boolean {
  const host = req.headers.host;
  return typeof host === 'string' && allowedHosts(cfg.port).has(host);
}

/**
 * Origin check for state-changing requests and WebSocket upgrades.
 * `requireHeader` = true rejects requests without an Origin header (browsers
 * always send it for CORS-relevant methods and WS upgrades).
 */
export function isValidOrigin(req: IncomingMessage, cfg: GuardConfig, requireHeader: boolean): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return !requireHeader;
  return typeof origin === 'string' && allowedOrigins(cfg.port).has(origin);
}

/** Remote socket must actually be loopback, whatever the headers claim. */
export function isLoopbackSocket(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/* ------------------------------------------------------------------ */
/* Sliding-window rate limiter (per key, in-memory)                    */
/* ------------------------------------------------------------------ */

export interface RateLimiter {
  /** Returns true if the event is allowed, false if rate-limited. */
  hit(key: string): boolean;
}

export function createRateLimiter(maxEvents: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, number[]>();
  return {
    hit(key: string): boolean {
      const t = now();
      let stamps = buckets.get(key);
      if (!stamps) {
        stamps = [];
        buckets.set(key, stamps);
      }
      // drop expired stamps
      while (stamps.length > 0 && stamps[0]! <= t - windowMs) stamps.shift();
      if (stamps.length >= maxEvents) return false;
      stamps.push(t);
      return true;
    },
  };
}

/**
 * Read a request body with a hard byte cap. Destroys the socket when the cap
 * is exceeded, so nothing more is buffered.
 */
export function readBodyCapped(req: IncomingMessage, maxBytes: number): Promise<Buffer | 'too-large'> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? '0');
    if (Number.isFinite(declared) && declared > maxBytes) {
      resolve('too-large');
      req.destroy();
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        resolve('too-large');
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

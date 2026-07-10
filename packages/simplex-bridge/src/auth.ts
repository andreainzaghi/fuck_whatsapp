/**
 * Session authentication for the local bridge.
 *
 * Flow:
 *  1. At startup the launcher mints a single-use bootstrap code. It is placed
 *     in the URL fragment (never sent over the network by browsers, stripped
 *     from the address bar by the frontend on first paint).
 *  2. The frontend exchanges it via POST /api/session. The bridge answers
 *     with an HttpOnly, SameSite=Strict session cookie. JavaScript never
 *     sees the session token — XSS cannot exfiltrate it.
 *  3. Every subsequent request (including the WebSocket upgrade) must carry
 *     the cookie AND a loopback Origin/Host.
 *
 * Tokens are compared through SHA-256 digests with timingSafeEqual.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;
const MAX_BOOTSTRAP_ATTEMPTS = 10;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export interface AuthState {
  /** One-time code for the launch URL fragment. Cleared after first use. */
  readonly bootstrapCode: string;
  consumeBootstrap(code: string): boolean;
  isValidSession(token: string | undefined): boolean;
  /** Mint the session token (single session per bridge run). */
  createSession(): string;
}

export function createAuth(now: () => number = Date.now): AuthState {
  const bootstrapCode = randomBytes(32).toString('base64url');
  const mintedAt = now();
  let bootstrapUsed = false;
  let attempts = 0;
  let sessionToken: string | null = null;

  return {
    bootstrapCode,
    consumeBootstrap(code: string): boolean {
      // Cheap, non-guess rejections happen BEFORE the attempt counter advances,
      // so malformed/oversized junk cannot burn the brute-force budget and lock
      // the legitimate user out (the counter guards only real guesses).
      if (bootstrapUsed) return false;
      if (now() - mintedAt > BOOTSTRAP_TTL_MS) return false;
      if (typeof code !== 'string' || code.length < 16 || code.length > 128) return false;
      if (attempts >= MAX_BOOTSTRAP_ATTEMPTS) return false;
      attempts += 1;
      if (!safeEqual(code, bootstrapCode)) return false;
      bootstrapUsed = true;
      return true;
    },
    createSession(): string {
      sessionToken = randomBytes(32).toString('base64url');
      return sessionToken;
    },
    isValidSession(token: string | undefined): boolean {
      if (!token || !sessionToken) return false;
      if (token.length < 16 || token.length > 128) return false;
      return safeEqual(token, sessionToken);
    },
  };
}

/** Parse the session cookie out of a Cookie header. No external deps. */
export function readSessionCookie(cookieHeader: string | undefined, cookieName: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === cookieName) {
      const v = part.slice(eq + 1).trim();
      return v.length > 0 ? v : undefined;
    }
  }
  return undefined;
}

export function sessionCookieValue(cookieName: string, token: string): string {
  // No Secure attribute: the origin is plain http on 127.0.0.1 (loopback only,
  // no network transit). HttpOnly keeps it away from scripts; SameSite=Strict
  // keeps it away from cross-site requests (incl. DNS-rebinding pages, whose
  // Host also fails validation).
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict`;
}

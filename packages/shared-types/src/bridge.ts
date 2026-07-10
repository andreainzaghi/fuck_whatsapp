/**
 * Bridge protocol — the ONLY surface between the React frontend and the local
 * launcher/bridge process. Everything here travels exclusively over
 * 127.0.0.1. Authentication: HttpOnly SameSite=Strict session cookie obtained
 * by exchanging a one-time bootstrap code (delivered in the URL fragment at
 * launch, stripped from history immediately).
 *
 * The bridge NEVER interprets, stores or logs chat plaintext. It proxies
 * WebSocket frames to the SimpleX core verbatim and stages attachment bytes
 * on the local disk for the core to encrypt and send.
 */

/** Lifecycle of the local SimpleX core process, as reported by the launcher. */
export type CoreStatus =
  | 'no-profile' // no database on disk — onboarding must create one
  | 'locked' // database exists, core not running, password required
  | 'starting' // core process spawned, waiting for WS / /_start
  | 'running' // core WS reachable, chat started
  | 'wrong-password' // last open attempt failed (core exited: ErrorNotADatabase)
  | 'error'; // core crashed or could not be started

export interface StatusResponse {
  coreStatus: CoreStatus;
  /** Core version string once known, e.g. "6.5.6.1". Null before first start. */
  coreVersion: string | null;
  /** Sanitized error code when coreStatus === 'error'. Never free text. */
  errorCode: string | null;
  /** Milliseconds the bridge process has been up (for the security panel). */
  uptimeMs: number;
}

export interface SessionRequest {
  /** One-time bootstrap code from the URL fragment. */
  bootstrap: string;
}

export interface SessionResponse {
  ok: true;
  status: StatusResponse;
}

export interface ProfileCreateRequest {
  displayName: string;
  /** Database passphrase. Sent only over loopback; never stored; never logged. */
  password: string;
}

export interface ProfileOpenRequest {
  password: string;
}

/** Response for both /api/profile/create and /api/profile/open. */
export interface ProfileActionResponse {
  ok: boolean;
  status: StatusResponse;
}

export interface UploadResponse {
  ok: true;
  /**
   * Absolute local path of the staged file — pass it as `filePath` in a
   * `/_send ... json [{"filePath": ...}]` command. The staging area is
   * garbage-collected after send completion or on shutdown.
   */
  absPath: string;
  /** Bytes written. */
  size: number;
}

export interface ApiError {
  ok: false;
  /** Machine-readable, sanitized. Never contains user content. */
  code:
    | 'bad-bootstrap'
    | 'unauthorized'
    | 'bad-origin'
    | 'rate-limited'
    | 'payload-too-large'
    | 'bad-request'
    | 'core-not-running'
    | 'core-already-running'
    | 'wrong-password'
    | 'weak-password'
    | 'profile-exists'
    | 'internal';
}

/** Bridge REST endpoints (all under http://127.0.0.1:<random-port>). */
export const BRIDGE_ROUTES = {
  /** POST {SessionRequest} -> SessionResponse | ApiError. Sets session cookie. */
  session: '/api/session',
  /** GET -> StatusResponse. Cookie required. */
  status: '/api/status',
  /** POST {ProfileCreateRequest} -> ProfileActionResponse | ApiError. */
  profileCreate: '/api/profile/create',
  /** POST {ProfileOpenRequest} -> ProfileActionResponse | ApiError. */
  profileOpen: '/api/profile/open',
  /**
   * POST raw bytes, headers: X-FWA-Filename (suggested name, sanitized by the
   * bridge). -> UploadResponse | ApiError.
   */
  upload: '/api/upload',
  /**
   * GET ?path=<absolute path> -> file bytes. Only paths inside the profile's
   * files/ or staging/ directories are ever served (realpath-confined).
   */
  file: '/api/file',
  /** WebSocket upgrade -> transparent proxy to the SimpleX core WS. */
  ws: '/api/ws',
  /**
   * POST -> {ok:true}. Cookie required. "Lock and close": locks the database
   * (stops the core), tears down the bridge and exits the launcher cleanly.
   */
  shutdown: '/api/shutdown',
} as const;

/** Name of the HttpOnly session cookie set by POST /api/session. */
export const SESSION_COOKIE = 'fwa_session';

/** URL fragment parameter carrying the one-time bootstrap code. */
export const BOOTSTRAP_FRAGMENT_PARAM = 'b';

/** Hard limits enforced by the bridge (mirrored client-side for UX only). */
export const BRIDGE_LIMITS = {
  /** Max upload size in bytes (files/images/voice notes). */
  maxUploadBytes: 100 * 1024 * 1024,
  /** Max WS text frame size relayed to the core. */
  maxWsFrameBytes: 1 * 1024 * 1024,
  /** Sliding-window WS message rate (messages per 10 s per connection). */
  wsMessagesPer10s: 300,
  /** Minimum database passphrase length accepted at profile creation. */
  minPasswordLength: 12,
} as const;

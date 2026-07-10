/**
 * Sanitized structured logger.
 *
 * HARD RULE (see docs/SECURITY_ARCHITECTURE.md): log lines may contain ONLY
 * — timestamp, component, event code, sanitized error code, correlation id.
 * Never message text, contact names, file names, personal paths, invitation
 * links, SimpleX addresses, passwords, tokens or WebSocket payloads.
 *
 * To make accidental leakage structurally hard, this logger accepts only a
 * fixed-vocabulary `LogCode` and an optional correlation id. The corrId is the
 * only string parameter, and it is meant to carry a random id (see newCorrId);
 * callers must never pass user-derived text there. There is deliberately no
 * message/detail parameter that could carry plaintext.
 */

export type LogComponent = 'launcher' | 'bridge' | 'core' | 'files' | 'wsproxy' | 'auth';

export type LogCode =
  // lifecycle
  | 'listen'
  | 'shutdown'
  | 'spawn'
  | 'ready'
  | 'exit_clean'
  | 'exit_error'
  | 'exit_wrong_key'
  | 'restart'
  // auth
  | 'session_created'
  | 'bootstrap_rejected'
  | 'auth_fail_token'
  | 'auth_fail_origin'
  | 'auth_fail_host'
  | 'rate_limited'
  // http
  | 'bad_request'
  | 'payload_too_large'
  | 'not_found'
  | 'internal_error'
  // ws proxy
  | 'ws_open'
  | 'ws_close'
  | 'ws_core_unreachable'
  | 'ws_frame_rejected'
  // files
  | 'upload_ok'
  | 'upload_rejected'
  | 'file_denied'
  | 'staging_cleaned';

export interface Logger {
  log(component: LogComponent, code: LogCode, corrId?: string): void;
}

/** Random per-process correlation prefix so runs can be distinguished. */
export function newCorrId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createLogger(sink: (line: string) => void = defaultSink): Logger {
  return {
    log(component, code, corrId) {
      const ts = new Date().toISOString();
      sink(`${ts} [${component}] ${code}${corrId ? ` cid=${corrId}` : ''}`);
    },
  };
}

function defaultSink(line: string): void {
  process.stdout.write(line + '\n');
}

/** A logger that drops everything (used in tests). */
export const nullLogger: Logger = { log: () => undefined };

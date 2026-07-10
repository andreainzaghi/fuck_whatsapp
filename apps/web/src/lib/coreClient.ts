/**
 * Singleton WebSocket client for the bridge's authenticated proxy to the
 * SimpleX core (ws://<host>/api/ws — the HttpOnly session cookie rides along
 * automatically on same-origin upgrades).
 *
 * - Auto-reconnect with exponential backoff 0.5s .. 10s while connect() is in
 *   effect; disconnect() stops reconnecting.
 * - send() correlates by a monotonically increasing corrId. It resolves with
 *   the response payload — INCLUDING `chatCmdError` (protocol-level errors are
 *   values, not exceptions) — and rejects only on timeout or disconnect.
 *   Commands issued while (re)connecting are queued and flushed on open.
 * - Envelopes without a matching corrId are fanned out to onEvent handlers.
 *
 * SECURITY: frames are never logged — they contain message plaintext.
 */
import { BRIDGE_ROUTES, type SxEnvelope, type SxResponse } from '@fwa/shared-types';

export type WsStatus = 'connecting' | 'open' | 'closed';

export interface CoreClient {
  connect(): void;
  disconnect(): void;
  send(cmd: string, timeoutMs?: number): Promise<SxResponse>;
  onEvent(h: (resp: SxResponse) => void): () => void;
  onStatus(h: (s: WsStatus) => void): () => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 10_000;

interface PendingCmd {
  cmd: string;
  sent: boolean;
  timer: number;
  resolve: (resp: SxResponse) => void;
  reject: (err: Error) => void;
}

let ws: WebSocket | null = null;
let wanted = false;
let corrCounter = 0;
let backoffMs = BACKOFF_MIN_MS;
let reconnectTimer: number | null = null;
let status: WsStatus = 'closed';

const pending = new Map<string, PendingCmd>();
const eventHandlers = new Set<(resp: SxResponse) => void>();
const statusHandlers = new Set<(s: WsStatus) => void>();

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  return `${proto}${window.location.host}${BRIDGE_ROUTES.ws}`;
}

function setStatus(next: WsStatus): void {
  if (next === status) return;
  status = next;
  for (const h of statusHandlers) {
    try {
      h(next);
    } catch {
      // a broken handler must not kill the client
    }
  }
}

function settlePending(corrId: string, rec: PendingCmd, err: Error): void {
  clearTimeout(rec.timer);
  pending.delete(corrId);
  rec.reject(err);
}

function rejectPending(onlySent: boolean, reason: string): void {
  for (const [corrId, rec] of [...pending]) {
    if (onlySent && !rec.sent) continue;
    settlePending(corrId, rec, new Error(reason));
  }
}

function flushQueue(sock: WebSocket): void {
  for (const [corrId, rec] of pending) {
    if (rec.sent) continue;
    try {
      sock.send(JSON.stringify({ corrId, cmd: rec.cmd }));
      rec.sent = true;
    } catch {
      break; // socket died mid-flush; close handler takes over
    }
  }
}

function scheduleReconnect(): void {
  if (!wanted || reconnectTimer !== null) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
}

function openSocket(): void {
  if (!wanted || ws !== null) return;
  setStatus('connecting');
  let sock: WebSocket;
  try {
    sock = new WebSocket(wsUrl());
  } catch {
    setStatus('closed');
    scheduleReconnect();
    return;
  }
  ws = sock;

  sock.onopen = () => {
    if (ws !== sock) return;
    backoffMs = BACKOFF_MIN_MS;
    setStatus('open');
    flushQueue(sock);
  };

  sock.onmessage = (ev: MessageEvent) => {
    if (ws !== sock || typeof ev.data !== 'string') return;
    let envelope: SxEnvelope;
    try {
      envelope = JSON.parse(ev.data) as SxEnvelope;
    } catch {
      return;
    }
    if (!envelope || typeof envelope !== 'object' || !envelope.resp) return;
    if (envelope.corrId) {
      const rec = pending.get(envelope.corrId);
      if (rec) {
        clearTimeout(rec.timer);
        pending.delete(envelope.corrId);
        rec.resolve(envelope.resp);
      }
      // correlated reply to a command we no longer track: drop, not an event
      return;
    }
    for (const h of eventHandlers) {
      try {
        h(envelope.resp);
      } catch {
        // a broken handler must not stop the pump
      }
    }
  };

  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    setStatus('closed');
    // in-flight commands can never be answered across a reconnect;
    // still-queued ones survive and are flushed on the next open.
    rejectPending(true, 'disconnected');
    scheduleReconnect();
  };

  sock.onerror = () => {
    // onclose always follows; nothing to do (and nothing to log)
  };
}

export const coreClient: CoreClient = {
  connect(): void {
    if (wanted) return;
    wanted = true;
    backoffMs = BACKOFF_MIN_MS;
    openSocket();
  },

  disconnect(): void {
    wanted = false;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const sock = ws;
    ws = null;
    try {
      sock?.close();
    } catch {
      // already closed
    }
    setStatus('closed');
    rejectPending(false, 'disconnected');
  },

  send(cmd: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<SxResponse> {
    return new Promise<SxResponse>((resolve, reject) => {
      if (!wanted) {
        reject(new Error('disconnected'));
        return;
      }
      const corrId = String(++corrCounter);
      const timer = window.setTimeout(() => {
        const rec = pending.get(corrId);
        if (rec) {
          pending.delete(corrId);
          rec.reject(new Error('timeout'));
        }
      }, timeoutMs);
      const rec: PendingCmd = { cmd, sent: false, timer, resolve, reject };
      pending.set(corrId, rec);
      const sock = ws;
      if (sock && sock.readyState === WebSocket.OPEN) {
        try {
          sock.send(JSON.stringify({ corrId, cmd }));
          rec.sent = true;
        } catch {
          // stays queued; reconnect will flush or the timeout will fire
        }
      }
      // not open yet: stays queued, flushed by onopen
    });
  },

  onEvent(h: (resp: SxResponse) => void): () => void {
    eventHandlers.add(h);
    return () => {
      eventHandlers.delete(h);
    };
  },

  onStatus(h: (s: WsStatus) => void): () => void {
    statusHandlers.add(h);
    return () => {
      statusHandlers.delete(h);
    };
  },
};

/**
 * Authenticated WebSocket proxy: browser <-> bridge <-> SimpleX core.
 *
 * The proxy relays frames verbatim in both directions. It validates only the
 * envelope shape (JSON with string corrId/cmd) and enforces size and rate
 * limits — it NEVER inspects, stores or logs command contents or events
 * (they contain decrypted message plaintext by design of the core API).
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { Logger } from './log.js';
import { createRateLimiter } from './guards.js';

export interface WsProxyConfig {
  corePort: number;
  maxFrameBytes: number;
  messagesPer10s: number;
  logger: Logger;
}

export interface WsProxy {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  closeAll(): void;
}

/** Envelope check without semantic interpretation. */
function isValidClientFrame(data: string): boolean {
  if (data.length === 0) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return typeof obj['corrId'] === 'string' && (obj['corrId'] as string).length <= 64 && typeof obj['cmd'] === 'string';
}

export function createWsProxy(cfg: WsProxyConfig): WsProxy {
  const wss = new WebSocketServer({ noServer: true, maxPayload: cfg.maxFrameBytes });
  const live = new Set<WebSocket>();

  wss.on('connection', (client: WebSocket) => {
    live.add(client);
    cfg.logger.log('wsproxy', 'ws_open');

    const core = new WebSocket(`ws://127.0.0.1:${cfg.corePort}`);
    const rate = createRateLimiter(cfg.messagesPer10s, 10_000);
    const backlog: string[] = [];
    let coreOpen = false;

    core.on('open', () => {
      coreOpen = true;
      for (const frame of backlog.splice(0)) core.send(frame);
    });

    core.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) return; // the core speaks JSON text only
      if (client.readyState === WebSocket.OPEN) client.send(data.toString('utf8'));
    });

    client.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary || data.length > cfg.maxFrameBytes) {
        cfg.logger.log('wsproxy', 'ws_frame_rejected');
        client.close(1009, 'frame rejected');
        return;
      }
      if (!rate.hit('c')) {
        cfg.logger.log('wsproxy', 'rate_limited');
        client.close(1008, 'rate limited');
        return;
      }
      const text = data.toString('utf8');
      if (!isValidClientFrame(text)) {
        cfg.logger.log('wsproxy', 'ws_frame_rejected');
        client.close(1008, 'invalid frame');
        return;
      }
      if (coreOpen && core.readyState === WebSocket.OPEN) core.send(text);
      else if (backlog.length < 64) backlog.push(text);
      else client.close(1013, 'core unavailable');
    });

    const teardown = () => {
      live.delete(client);
      cfg.logger.log('wsproxy', 'ws_close');
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) client.close();
      if (core.readyState === WebSocket.OPEN || core.readyState === WebSocket.CONNECTING) core.close();
    };

    client.on('close', teardown);
    client.on('error', teardown);
    core.on('close', teardown);
    core.on('error', () => {
      cfg.logger.log('wsproxy', 'ws_core_unreachable');
      teardown();
    });
  });

  return {
    handleUpgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, (client) => {
        wss.emit('connection', client, req);
      });
    },
    closeAll() {
      for (const client of live) client.close(1001, 'bridge shutdown');
      wss.close();
    },
  };
}

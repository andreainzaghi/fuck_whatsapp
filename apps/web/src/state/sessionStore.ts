/**
 * Session / core lifecycle state. Owns the bootstrap exchange, the
 * profile-create/unlock flows and the coreStatus -> UI phase mapping.
 */
import { create } from 'zustand';
import { sxCommands, type SxActiveUser, type StatusResponse } from '@fwa/shared-types';
import {
  createProfile as apiCreateProfile,
  exchangeSession,
  getStatus,
  openProfile as apiOpenProfile,
} from '../lib/bridgeClient';
import { coreClient } from '../lib/coreClient';
import { captureBootstrap, takeBootstrap } from '../lib/bootstrap';
import { useChatsStore } from './chatsStore';

export type SessionPhase = 'boot' | 'no-session' | 'onboarding' | 'unlock' | 'starting' | 'ready' | 'error';

export interface SessionState {
  phase: SessionPhase;
  coreVersion: string | null;
  user: { userId: number; displayName: string } | null;
  /** Sanitized error code shown on the 'error' screen (and 'wrong-password' on unlock). Never free text. */
  errorCode: string | null;
  init(): Promise<void>;
  /** Returns null on success, a sanitized error code otherwise. */
  create(displayName: string, password: string): Promise<string | null>;
  /** Returns null on success, a sanitized error code otherwise. */
  unlock(password: string): Promise<string | null>;
}

let initInFlight = false;
let pollTimer: number | null = null;

export const useSessionStore = create<SessionState>((set, get) => {
  /** Core is running: start the event pump, connect the WS, fill the user. */
  async function goReady(): Promise<void> {
    // Pump first so no status transition or early event is missed.
    useChatsStore.getState().startEventPump();
    coreClient.connect();
    try {
      const resp = await coreClient.send(sxCommands.activeUser());
      if (resp.type === 'activeUser') {
        const u = (resp as SxActiveUser).user;
        set({ user: { userId: u.userId, displayName: u.profile.displayName } });
      }
    } catch {
      // WS momentarily unreachable — the client keeps reconnecting.
    }
    set({ phase: 'ready' });
  }

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  /** While the core is 'starting', poll /api/status until it settles. */
  function pollWhileStarting(): void {
    stopPolling();
    pollTimer = window.setTimeout(() => {
      pollTimer = null;
      void (async () => {
        if (get().phase !== 'starting') return;
        const status = await getStatus();
        if (get().phase !== 'starting') return;
        if (status) applyStatus(status);
        else pollWhileStarting();
      })();
    }, 1000);
  }

  function applyStatus(status: StatusResponse): void {
    stopPolling();
    set({ coreVersion: status.coreVersion });
    switch (status.coreStatus) {
      case 'no-profile':
        set({ phase: 'onboarding', errorCode: null });
        break;
      case 'locked':
        set({ phase: 'unlock', errorCode: null });
        break;
      case 'wrong-password':
        set({ phase: 'unlock', errorCode: 'wrong-password' });
        break;
      case 'starting':
        set({ phase: 'starting', errorCode: null });
        pollWhileStarting();
        break;
      case 'running':
        set({ errorCode: null });
        void goReady();
        break;
      case 'error':
        set({ phase: 'error', errorCode: status.errorCode ?? 'internal' });
        break;
    }
  }

  return {
    phase: 'boot',
    coreVersion: null,
    user: null,
    errorCode: null,

    async init() {
      if (initInFlight) return;
      initInFlight = true;
      try {
        captureBootstrap(); // idempotent — main.tsx already stripped the URL
        const bootstrap = takeBootstrap();
        let status: StatusResponse | null = null;
        if (bootstrap) status = await exchangeSession(bootstrap);
        if (!status) status = await getStatus(); // existing session cookie
        if (!status) {
          set({ phase: 'no-session' });
          return;
        }
        applyStatus(status);
      } finally {
        initInFlight = false;
      }
    },

    async create(displayName: string, password: string) {
      const res = await apiCreateProfile(displayName, password);
      if (!res.ok) return res.code ?? 'internal';
      const status = res.status ?? (await getStatus());
      if (status) applyStatus(status);
      return null;
    },

    async unlock(password: string) {
      const res = await apiOpenProfile(password);
      if (!res.ok) return res.code ?? 'internal';
      const status = res.status ?? (await getStatus());
      if (status) applyStatus(status);
      return null;
    },
  };
});

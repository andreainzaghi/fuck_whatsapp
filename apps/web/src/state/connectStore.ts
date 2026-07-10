/**
 * Invitation flows: create a one-time invitation link and accept a peer's
 * link. `lastConnected` is set by the chatsStore event pump when the
 * contactConnected handshake completes (either direction).
 */
import { create } from 'zustand';
import { sxCommands, type SxChatCmdError, type SxInvitation } from '@fwa/shared-types';
import { coreClient } from '../lib/coreClient';
import { useSessionStore } from './sessionStore';

export interface ConnectState {
  /** Full invitation link (`simplex:/invitation#/?...`) — render as QR + copy. */
  invitation: string | null;
  creating: boolean;
  /** Display name of the most recently connected contact. */
  lastConnected: string | null;
  createInvitation(): Promise<void>;
  /** Returns null on success, a sanitized error code otherwise. */
  acceptInvitation(link: string): Promise<string | null>;
}

export const useConnectStore = create<ConnectState>((set) => ({
  invitation: null,
  creating: false,
  lastConnected: null,

  async createInvitation(): Promise<void> {
    const userId = useSessionStore.getState().user?.userId;
    if (userId == null) return;
    set({ creating: true });
    try {
      const resp = await coreClient.send(sxCommands.createInvitation(userId), 60_000);
      if (resp.type === 'invitation') {
        set({ invitation: (resp as SxInvitation).connLinkInvitation.connFullLink });
      }
    } catch {
      // timed out / disconnected — keep any previous invitation
    } finally {
      set({ creating: false });
    }
  },

  async acceptInvitation(link: string): Promise<string | null> {
    const trimmed = link.trim();
    if (!trimmed) return 'bad-link';
    let resp;
    try {
      resp = await coreClient.send(sxCommands.acceptInvitation(trimmed), 60_000);
    } catch {
      return 'disconnected';
    }
    if (resp.type === 'chatCmdError') {
      const err = (resp as SxChatCmdError).chatError;
      // protocol error codes only — never user content
      return err.errorType?.type ?? err.type ?? 'error';
    }
    // 'sentConfirmation' — the contactConnected event follows asynchronously
    return null;
  },
}));

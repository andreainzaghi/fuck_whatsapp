/**
 * Chats state: chat list, per-contact message timelines, the WS event pump
 * and all send/receive flows. The SimpleX core is the single source of truth;
 * this store only mirrors what the core reports — nothing is persisted here.
 *
 * Two chat-item shapes exist in the protocol (docs/SIMPLEX_INTEGRATION.md):
 *  - `newChatItems` / status / file events: wrapped { chatInfo, chatItem }
 *  - `apiChat` responses: direct chat items, no wrapper
 */
import { create } from 'zustand';
import {
  sxCommands,
  type SxAChatItem,
  type SxApiChat,
  type SxChatInfoDirect,
  type SxChatItem,
  type SxChats,
  type SxChatItemsStatusesUpdated,
  type SxContact,
  type SxContactConnected,
  type SxMsgContent,
  type SxNewChatItems,
  type SxRcvFileEvent,
  type SxResponse,
} from '@fwa/shared-types';
import { deleteStaged, uploadBlob } from '../lib/bridgeClient';
import { coreClient, type WsStatus } from '../lib/coreClient';
import { useSessionStore } from './sessionStore';
import { useConnectStore } from './connectStore';

export interface ChatSummary {
  contactId: number;
  displayName: string;
  lastText: string;
  lastTs: string;
  unread: number;
}

export interface Message {
  itemId: number;
  dir: 'in' | 'out';
  text: string;
  ts: string;
  status: string;
  kind: 'text' | 'image' | 'voice' | 'file' | 'video';
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  fileId?: number;
  fileStatus?: string;
  duration?: number;
  imagePreview?: string;
}

export interface ChatsState {
  chats: ChatSummary[];
  messages: Record<number, Message[]>;
  activeContactId: number | null;
  wsStatus: WsStatus;
  startEventPump(): void;
  loadChats(): Promise<void>;
  openChat(contactId: number): Promise<void>;
  sendText(contactId: number, text: string): Promise<void>;
  sendAttachment(
    contactId: number,
    blob: Blob,
    filename: string,
    kind: 'image' | 'file' | 'voice' | 'video',
    extra?: { duration?: number; imagePreview?: string },
  ): Promise<void>;
  acceptFile(fileId: number): Promise<void>;
}

/** Staged upload path per sent itemId — deleted after sndFileCompleteXFTP. */
const stagedUploads = new Map<number, string>();
let pumpStarted = false;

function asDirect(info: { type: string }): SxChatInfoDirect | null {
  return info.type === 'direct' ? (info as SxChatInfoDirect) : null;
}

function contactName(contact: SxContact): string {
  return contact.profile?.displayName || contact.localDisplayName || `Contact ${contact.contactId}`;
}

function mapKind(mc: SxMsgContent | undefined): Message['kind'] {
  switch (mc?.type) {
    case 'image':
      return 'image';
    case 'voice':
      return 'voice';
    case 'file':
      return 'file';
    case 'video':
      return 'video';
    default:
      return 'text'; // 'text', 'link' and anything unknown render as text
  }
}

/** Map a core chat item to a UI message; null for non-content (system) items. */
function mapChatItem(item: SxChatItem): Message | null {
  const content = item.content;
  if (content.type !== 'sndMsgContent' && content.type !== 'rcvMsgContent') return null;
  const mc = content.msgContent;
  const msg: Message = {
    itemId: item.meta.itemId,
    dir: content.type === 'rcvMsgContent' ? 'in' : 'out',
    text: mc?.text ?? item.meta.itemText ?? '',
    ts: item.meta.itemTs,
    status: item.meta.itemStatus?.type ?? '',
    kind: mapKind(mc),
  };
  if (item.file) {
    msg.fileId = item.file.fileId;
    msg.fileName = item.file.fileName;
    msg.fileSize = item.file.fileSize;
    msg.fileStatus = item.file.fileStatus?.type;
    if (item.file.fileSource?.filePath) msg.filePath = item.file.fileSource.filePath;
  }
  if (mc && (mc.type === 'voice' || mc.type === 'video')) msg.duration = mc.duration;
  if (mc && (mc.type === 'image' || mc.type === 'video')) msg.imagePreview = mc.image;
  return msg;
}

/** Chat-list preview line for a message (no content beyond the text itself). */
function previewText(msg: Message): string {
  if (msg.text) return msg.text;
  switch (msg.kind) {
    case 'image':
      return 'Photo';
    case 'voice':
      return 'Voice message';
    case 'video':
      return 'Video';
    case 'file':
      return msg.fileName ?? 'File';
    default:
      return '';
  }
}

function buildMsgContent(
  kind: 'image' | 'file' | 'voice' | 'video',
  extra?: { duration?: number; imagePreview?: string },
): SxMsgContent {
  switch (kind) {
    case 'image':
      return { type: 'image', text: '', image: extra?.imagePreview ?? '' };
    case 'voice':
      return { type: 'voice', text: '', duration: extra?.duration ?? 0 };
    case 'video':
      return { type: 'video', text: '', image: extra?.imagePreview ?? '', duration: extra?.duration ?? 0 };
    case 'file':
      return { type: 'file', text: '' };
  }
}

export const useChatsStore = create<ChatsState>((set, get) => {
  function upsertMessage(contactId: number, msg: Message): void {
    set((s) => {
      const list = s.messages[contactId] ?? [];
      const idx = list.findIndex((m) => m.itemId === msg.itemId);
      const next =
        idx >= 0
          ? list.map((m, i) => (i === idx ? { ...m, ...msg } : m))
          : [...list, msg].sort((a, b) => a.itemId - b.itemId);
      return { messages: { ...s.messages, [contactId]: next } };
    });
  }

  /** Move/insert the chat at the top of the list and update its preview. */
  function bumpChat(contactId: number, name: string, msg: Message): void {
    set((s) => {
      const existing = s.chats.find((c) => c.contactId === contactId);
      const incUnread = msg.dir === 'in' && s.activeContactId !== contactId;
      const summary: ChatSummary = {
        contactId,
        displayName: name || existing?.displayName || `Contact ${contactId}`,
        lastText: previewText(msg),
        lastTs: msg.ts,
        unread: (existing?.unread ?? 0) + (incUnread ? 1 : 0),
      };
      return { chats: [summary, ...s.chats.filter((c) => c.contactId !== contactId)] };
    });
  }

  function handleWrappedItems(items: SxAChatItem[], bump: boolean): void {
    for (const wrapped of items) {
      const direct = asDirect(wrapped.chatInfo);
      if (!direct) continue;
      const msg = mapChatItem(wrapped.chatItem);
      if (!msg) continue;
      const contactId = direct.contact.contactId;
      upsertMessage(contactId, msg);
      if (bump) bumpChat(contactId, contactName(direct.contact), msg);
    }
  }

  /** Single handler for pump events AND correlated command responses. */
  function handleResp(resp: SxResponse): void {
    switch (resp.type) {
      case 'newChatItems':
        handleWrappedItems((resp as SxNewChatItems).chatItems, true);
        break;

      case 'chatItemsStatusesUpdated':
        // delivery ticks: sndNew -> sndSent -> sndRcvd
        handleWrappedItems((resp as SxChatItemsStatusesUpdated).chatItems, false);
        break;

      case 'contactConnected': {
        const contact = (resp as SxContactConnected).contact;
        const name = contactName(contact);
        set((s) => {
          if (s.chats.some((c) => c.contactId === contact.contactId)) return {};
          const summary: ChatSummary = {
            contactId: contact.contactId,
            displayName: name,
            lastText: 'Connected',
            lastTs: new Date().toISOString(),
            unread: 0,
          };
          return { chats: [summary, ...s.chats] };
        });
        useConnectStore.setState({ lastConnected: name });
        break;
      }

      case 'rcvFileDescrReady':
      case 'rcvFileAccepted':
      case 'rcvFileStart':
      case 'rcvFileProgressXFTP':
      case 'rcvFileComplete':
      case 'sndFileProgressXFTP': {
        // rcvFileComplete carries the final filePath in the embedded item
        const ev = resp as SxRcvFileEvent;
        const wrapped = ev.chatItem_ ?? ev.chatItem;
        if (wrapped) handleWrappedItems([wrapped], false);
        break;
      }

      case 'sndFileCompleteXFTP': {
        const ev = resp as SxRcvFileEvent;
        const wrapped = ev.chatItem_ ?? ev.chatItem;
        if (wrapped) {
          handleWrappedItems([wrapped], false);
          const itemId = wrapped.chatItem.meta.itemId;
          const staged = stagedUploads.get(itemId);
          if (staged) {
            stagedUploads.delete(itemId);
            void deleteStaged(staged); // core sent it — remove the staged copy
          }
        }
        break;
      }

      default:
        break; // connectivity/diff events are consumed elsewhere or ignored
    }
  }

  return {
    chats: [],
    messages: {},
    activeContactId: null,
    wsStatus: 'closed',

    startEventPump(): void {
      if (pumpStarted) return;
      pumpStarted = true;
      coreClient.onStatus((s) => set({ wsStatus: s }));
      coreClient.onEvent((resp) => handleResp(resp));
    },

    async loadChats(): Promise<void> {
      const userId = useSessionStore.getState().user?.userId;
      if (userId == null) return;
      let resp: SxResponse;
      try {
        resp = await coreClient.send(sxCommands.getChats(userId));
      } catch {
        return;
      }
      if (resp.type !== 'apiChats') return;
      const rows = (resp as SxChats).chats;
      const summaries: ChatSummary[] = [];
      for (const row of rows) {
        const direct = asDirect(row.chatInfo as { type: string });
        if (!direct) continue;
        const last = row.chatItems.length > 0 ? row.chatItems[row.chatItems.length - 1] : undefined;
        const lastMsg = last ? mapChatItem(last) : null;
        summaries.push({
          contactId: direct.contact.contactId,
          displayName: contactName(direct.contact),
          lastText: lastMsg ? previewText(lastMsg) : (last?.meta.itemText ?? ''),
          lastTs: last?.meta.itemTs ?? '',
          unread: row.chatStats?.unreadCount ?? 0,
        });
      }
      summaries.sort((a, b) => (a.lastTs < b.lastTs ? 1 : a.lastTs > b.lastTs ? -1 : 0));
      set({ chats: summaries });
    },

    async openChat(contactId: number): Promise<void> {
      // Activate first so concurrent incoming items don't bump unread.
      set((s) => ({
        activeContactId: contactId,
        chats: s.chats.map((c) => (c.contactId === contactId ? { ...c, unread: 0 } : c)),
      }));
      try {
        const resp = await coreClient.send(sxCommands.getChat(contactId, 100));
        if (resp.type === 'apiChat') {
          // apiChat items are DIRECT chat items (no chatItem wrapper)
          const items = (resp as SxApiChat).chat.chatItems;
          const msgs = items
            .map(mapChatItem)
            .filter((m): m is Message => m !== null)
            .sort((a, b) => a.itemId - b.itemId);
          set((s) => ({ messages: { ...s.messages, [contactId]: msgs } }));
        }
        void coreClient.send(sxCommands.markRead(contactId)).catch(() => undefined);
      } catch {
        // offline — reconnect will allow a retry
      }
    },

    async sendText(contactId: number, text: string): Promise<void> {
      const trimmed = text.trim();
      if (!trimmed) return;
      try {
        // The correlated response IS the newChatItems payload — feed it to the
        // same handler the pump uses (responses never reach onEvent).
        const resp = await coreClient.send(sxCommands.sendText(contactId, trimmed));
        handleResp(resp);
      } catch {
        // timed out / disconnected: no local echo, honest about not-sent
      }
    },

    async sendAttachment(
      contactId: number,
      blob: Blob,
      filename: string,
      kind: 'image' | 'file' | 'voice' | 'video',
      extra?: { duration?: number; imagePreview?: string },
    ): Promise<void> {
      const staged = await uploadBlob(blob, filename);
      if (!staged) return;
      const composed = [{ filePath: staged.absPath, msgContent: buildMsgContent(kind, extra) }];
      let resp: SxResponse | null = null;
      try {
        resp = await coreClient.send(sxCommands.sendComposed(contactId, composed), 60_000);
      } catch {
        resp = null;
      }
      if (resp && resp.type === 'newChatItems') {
        for (const wrapped of (resp as SxNewChatItems).chatItems) {
          stagedUploads.set(wrapped.chatItem.meta.itemId, staged.absPath);
        }
        handleResp(resp);
      } else {
        void deleteStaged(staged.absPath); // send failed — drop the staged bytes
      }
    },

    async acceptFile(fileId: number): Promise<void> {
      try {
        const resp = await coreClient.send(sxCommands.receiveFile(fileId));
        handleResp(resp); // rcvFileAccepted carries the updated chat item
      } catch {
        // offline — the file offer stays accept-able
      }
    },
  };
});

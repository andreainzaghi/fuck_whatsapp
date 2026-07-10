/**
 * SimpleX Chat CLI WebSocket API types — the subset used by FWA.
 *
 * These mirror the REAL payloads observed against simplex-chat v6.5.6
 * (see docs/SIMPLEX_INTEGRATION.md for the raw captures). They are read-only
 * descriptions of the official protocol — FWA never re-implements any of the
 * underlying cryptography or queue management.
 */

/** Envelope sent TO the core. */
export interface SxRequest {
  corrId: string;
  cmd: string;
}

/** Envelope received FROM the core. corrId present only for command replies. */
export interface SxEnvelope {
  corrId?: string;
  resp: SxResponse;
}

/** Discriminated by `type`. Only the variants FWA consumes are typed. */
export type SxResponse =
  | SxActiveUser
  | SxVersionInfo
  | SxChatStarted
  | SxInvitation
  | SxContactConnected
  | SxNewChatItems
  | SxChatItemsStatusesUpdated
  | SxApiChat
  | SxChats
  | SxUserServers
  | SxRcvFileEvent
  | SxCmdOk
  | SxChatCmdError
  | SxOther;

export interface SxUser {
  userId: number;
  localDisplayName: string;
  profile: { profileId: number; displayName: string; fullName: string };
  activeUser: boolean;
}

export interface SxActiveUser {
  type: 'activeUser';
  user: SxUser;
}

export interface SxVersionInfo {
  type: 'versionInfo';
  versionInfo: { version: string; simplexmqVersion: string };
}

export interface SxChatStarted {
  type: 'chatStarted';
}

export interface SxCmdOk {
  type: 'cmdOk';
}

export interface SxChatCmdError {
  type: 'chatCmdError';
  chatError: { type: string; errorType?: { type: string } };
}

/** `/_connect <userId>` — one-time invitation. */
export interface SxInvitation {
  type: 'invitation';
  connLinkInvitation: {
    /** `simplex:/invitation#/?v=2-7&smp=...` — full link, works offline. */
    connFullLink: string;
    /** `https://smp*.simplex.im/i#...` — short link. */
    connShortLink?: string;
  };
}

export interface SxContact {
  contactId: number;
  localDisplayName: string;
  profile: { displayName: string; fullName: string };
  contactStatus?: string;
}

export interface SxContactConnected {
  type: 'contactConnected';
  contact: SxContact;
}

export type SxMsgContent =
  | { type: 'text'; text: string }
  | { type: 'image'; text: string; image: string }
  | { type: 'voice'; text: string; duration: number }
  | { type: 'video'; text: string; image: string; duration: number }
  | { type: 'file'; text: string }
  | { type: 'link'; text: string; preview?: unknown };

export type SxSndStatus = 'sndNew' | 'sndSent' | 'sndRcvd' | 'sndErrorAuth' | 'sndError';

export interface SxFileStatus {
  type: string; // sndStored | sndComplete | rcvInvitation | rcvAccepted | rcvComplete | ...
}

export interface SxCiFile {
  fileId: number;
  fileName: string;
  fileSize: number;
  fileStatus: SxFileStatus;
  fileProtocol: 'xftp' | 'smp' | 'local';
  fileSource?: { filePath: string };
}

export interface SxChatItem {
  chatDir: { type: 'directSnd' | 'directRcv' };
  meta: {
    itemId: number;
    itemTs: string;
    itemText: string;
    itemStatus: { type: SxSndStatus | 'rcvNew' | 'rcvRead' };
    createdAt: string;
  };
  content: {
    type: 'sndMsgContent' | 'rcvMsgContent' | string;
    msgContent?: SxMsgContent;
  };
  file?: SxCiFile;
}

export interface SxChatInfoDirect {
  type: 'direct';
  contact: SxContact;
}

/** Shape inside `newChatItems` events — NOTE the extra `chatItem` wrapper. */
export interface SxAChatItem {
  chatInfo: SxChatInfoDirect | { type: string };
  chatItem: SxChatItem;
}

export interface SxNewChatItems {
  type: 'newChatItems';
  user: SxUser;
  chatItems: SxAChatItem[];
}

export interface SxChatItemsStatusesUpdated {
  type: 'chatItemsStatusesUpdated';
  user: SxUser;
  chatItems: SxAChatItem[];
}

/** `/_get chat @N count=K` — items are DIRECT SxChatItem, no wrapper. */
export interface SxApiChat {
  type: 'apiChat';
  chat: {
    chatInfo: SxChatInfoDirect | { type: string };
    chatItems: SxChatItem[];
  };
}

/** `/_get chats <userId> pcc=on`. Observed live: the response type is `apiChats`. */
export interface SxChats {
  type: 'apiChats';
  chats: Array<{
    chatInfo: (SxChatInfoDirect & { contact: SxContact & { chatSettings?: unknown } }) | { type: string; [k: string]: unknown };
    chatItems: SxChatItem[];
    chatStats?: { unreadCount: number; minUnreadItemId: number };
  }>;
}

export interface SxServerOperator {
  operatorId: number;
  operatorTag: string;
  tradeName: string;
  legalName?: string;
  serverDomains: string[];
  enabled: boolean;
  smpRoles: { storage: boolean; proxy: boolean };
  xftpRoles: { storage: boolean; proxy: boolean };
}

export interface SxUserServer {
  serverId: number;
  /** `smp://<fingerprint>@host1,host2.onion` */
  server: string;
  preset: boolean;
  enabled: boolean;
  deleted: boolean;
}

export interface SxUserServers {
  type: 'userServers';
  userServers: Array<{
    operator?: SxServerOperator;
    smpServers: SxUserServer[];
    xftpServers: SxUserServer[];
  }>;
}

/** File download lifecycle events. */
export interface SxRcvFileEvent {
  type:
    | 'rcvFileDescrReady'
    | 'rcvFileAccepted'
    | 'rcvFileStart'
    | 'rcvFileProgressXFTP'
    | 'rcvFileComplete'
    | 'sndFileProgressXFTP'
    | 'sndFileCompleteXFTP';
  chatItem_?: SxAChatItem;
  chatItem?: SxAChatItem;
  [k: string]: unknown;
}

/** Any event/response FWA doesn't explicitly consume. Kept, never logged. */
export interface SxOther {
  type: string;
  [k: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Command builders — exact formats verified against v6.5.6.           */
/* ------------------------------------------------------------------ */

export const sxCommands = {
  version: () => '/version',
  activeUser: () => '/u',
  startChat: () => '/_start',
  createInvitation: (userId: number) => `/_connect ${userId}`,
  acceptInvitation: (link: string) => `/connect ${link.trim()}`,
  sendText: (contactId: number, text: string) => `/_send @${contactId} text ${text}`,
  /** filePath must be an absolute path the core process can read. */
  sendComposed: (contactId: number, composed: Array<{ filePath?: string; msgContent: SxMsgContent }>) =>
    `/_send @${contactId} json ${JSON.stringify(composed)}`,
  receiveFile: (fileId: number) => `/freceive ${fileId}`,
  getChat: (contactId: number, count: number, afterId?: number) =>
    afterId != null
      ? `/_get chat @${contactId} after=${afterId} count=${count}`
      : `/_get chat @${contactId} count=${count}`,
  getChats: (userId: number) => `/_get chats ${userId} pcc=on`,
  markRead: (contactId: number) => `/_read chat @${contactId}`,
  getServers: (userId: number) => `/_servers ${userId}`,
  deleteContact: (contactId: number) => `/_delete @${contactId} full notify=on`,
} as const;

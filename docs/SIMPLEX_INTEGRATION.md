# SimpleX Integration — Empirically Verified API Reference

Every statement in this document was verified by hand against a real running
core on 2026-07-10. Do not trust older examples found online: several of them
(including the deprecated `@simplex-chat/webrtc-client` docs) describe formats
that no longer match.

## Binary

| Property | Value |
|---|---|
| Version tested | **v6.5.6** (binary reports `6.5.6.1`) |
| Source | `https://github.com/simplex-chat/simplex-chat/releases/download/v6.5.6/simplex-chat-macos-aarch64` |
| SHA-256 (macos-aarch64) | `06eedfcad8cbf31abb2c13892592a1a532c4043c4954be645dfe8a1447ee9066` (computed locally at install; the official `_sha256sums` for v6.5.6 covers Linux assets only — documented in KNOWN_LIMITATIONS.md) |
| macOS dependency | Homebrew `openssl@3.0` (`/opt/homebrew/opt/openssl@3.0/lib/libcrypto.3.dylib`). Without it the binary aborts at dyld load. |
| License | AGPL-3.0 |

Official Linux checksums for v6.5.6 (from the signed `_sha256sums` release asset):

```
eaa3106616a39acdca75b2312d56e41babb6ebca54204c943a992ec4b9461154  simplex-chat-ubuntu-22_04-x86_64
0aec0a1ebd35ec3dfbb9f969f5d58e4269c8eca236f5be096780b9465dda2dbe  simplex-chat-ubuntu-24_04-x86_64
```

## CLI flags actually used by the launcher

```
-d,--database DB_FILE      path PREFIX (creates <prefix>_chat.db and <prefix>_agent.db)
-k,--key KEY               database encryption passphrase (see security note below)
-p,--chat-server-port PORT WebSocket server port — VERIFIED to bind 127.0.0.1 only (lsof)
-m,--maintenance           start WS server WITHOUT starting chat; requires an existing user
-l,--log-level LEVEL       error | important | warn | info | debug
-y,--yes-migrate           auto-confirm database migrations (required non-interactive)
--files-folder FOLDER      where received files are written
--temp-folder FOLDER       temp encrypted files location
--device-name DEVICE       device label
-s,--server / --xftp-server  custom SMP/XFTP servers
-x / --socks-proxy S5      Tor / SOCKS5 proxy
--auto-accept-files SIZE   auto-download incoming files up to SIZE bytes
```

## Process lifecycle facts (all verified)

1. **First start, fresh DB, no user**: the CLI prompts `display name:` on
   **stdin**. Writing the name + `\n` to stdin creates the profile. This keeps
   the display name out of the process argument list.
2. **Fresh DB + `-k KEY`**: the database is created encrypted from the very
   first byte. This is the flow the launcher uses — there is never a plaintext
   database on disk.
3. **stdin EOF kills the process** (`hGetLine: end of file`). The launcher must
   keep the stdin pipe open for the whole process lifetime.
4. **`-m` (maintenance) with no user exits** (`exiting: no active user in
   maintenance mode`). Use maintenance mode only when the profile exists.
5. **`/_stop` terminates the terminal CLI** (`AsyncCancelled`), it does not
   merely stop the chat controller. Never call `/_stop` expecting the server to
   survive. Database re-encryption is done from maintenance mode instead.
6. **Encrypted DB, wrong/missing `-k`**: process exits with
   `SQLite3 returned ErrorNotADatabase`. Fail-closed. The launcher detects this
   exit to report "wrong password" to the UI.
7. **The CLI echoes every received WS command to stdout** (even at `-l error`),
   e.g. `received command "1" : "/db encrypt <key>"`. Production launcher MUST
   discard core stdout/stderr (pipe to /dev/null) — never write them to a log.

## WebSocket protocol (port `-p`, binds 127.0.0.1)

Requests and responses are single-frame JSON text messages.

```jsonc
// request
{ "corrId": "42", "cmd": "/u" }
// response (matches corrId)
{ "corrId": "42", "resp": { "type": "activeUser", "user": { ... } } }
// asynchronous event (no corrId)
{ "resp": { "type": "newChatItems", ... } }
```

`resp.type` discriminates the payload. Command errors come back as
`{"type":"chatCmdError","chatError":{...}}` — still correlated by `corrId`.

## Commands (verified, with observed responses)

| Purpose | Command | Response `type` |
|---|---|---|
| Core version | `/version` | `versionInfo` (`versionInfo.version = "6.5.6.1"`) |
| Active user | `/u` | `activeUser` (works in maintenance mode before `/_start`) |
| List users | `/users` | `usersList` |
| Start chat (from maintenance) | `/_start` | `chatStarted` |
| Encrypt DB (maintenance only) | `/_db encryption {"currentKey":"","newKey":"<key>","keepKey":false}` | `cmdOk` (fails with `chatNotStopped` if chat running) |
| One-time invitation | `/_connect 1` (1 = userId) | `invitation` → `connLinkInvitation.connFullLink` (`simplex:/invitation#/?v=2-7&smp=...`) and `.connShortLink` (`https://smp5.simplex.im/i#...`) |
| Accept invitation | `/connect <full-or-short-link>` | `sentConfirmation`; then `contactConnected` events on BOTH sides |
| Send text | `/_send @<contactId> text <text>` | `newChatItems`, item `meta.itemStatus = {"type":"sndNew"}` |
| Send file/image/voice | `/_send @<contactId> json [{"filePath":"<abs path>","msgContent":{...}}]` | `newChatItems`, item `file.fileProtocol = "xftp"`, `file.fileStatus.type = "sndStored"` |
| Accept incoming file | `/freceive <fileId>` | `rcvFileAccepted`, then `rcvFileStart`, `rcvFileProgressXFTP`, `rcvFileComplete` events; file appears in `--files-folder` (SHA-256 verified identical end-to-end) |
| Chat history | `/_get chat @<contactId> count=<n>` | `apiChat` — `chat.chatItems[]` are **direct** `ChatItem` objects (`{chatDir, meta, content, file?}`) |
| Chat list | `/_get chats <userId> pcc=on` | `apiChats` — `chats[]` of `{chatInfo, chatItems: [lastItem]}` (v6.5.6 answers `apiChats`, not the older `chats`) |
| Mark read | `/_read chat @<contactId>` | `cmdOk` |
| Configured servers | `/_servers <userId>` | `userServers` — operators (`SimpleX Chat Ltd`, `Flux`) with `smpServers[]`/`xftpServers[]`, `preset`/`enabled` flags |
| Set servers | `/_servers <userId> <json>` | `cmdOk` |
| Delete contact | `/_delete @<contactId>` | `contactDeleted` |
| Network status | `/_network` | `networkConfig` |

### msgContent shapes (verified)

```jsonc
// text
{ "type": "text", "text": "hello" }
// image — image field is a small base64 data: URI preview/thumbnail
{ "type": "image", "text": "", "image": "data:image/png;base64,..." }
// voice — duration in seconds; audio bytes travel as the attached file
{ "type": "voice", "text": "", "duration": 3 }
// generic file
{ "type": "file", "text": "" }
// video — image field carries the thumbnail
{ "type": "video", "text": "", "image": "data:image/jpg;base64,...", "duration": 0 }
```

### Events the UI must handle (all observed live)

| Event `type` | Meaning |
|---|---|
| `contactConnected` | invitation handshake completed; `contact.contactId`, `contact.localDisplayName` |
| `newChatItems` | incoming OR just-sent items; `chatItems[] = {chatInfo, chatItem}` (note the wrapper here, unlike `apiChat`) |
| `chatItemsStatusesUpdated` | delivery ticks: `sndNew → sndSent → sndRcvd` |
| `rcvFileDescrReady` | incoming file ready to accept |
| `rcvFileStart` / `rcvFileProgressXFTP` / `rcvFileComplete` | download lifecycle; `rcvFileComplete.chatItem_.chatItem.file.fileSource.filePath` is the final path |
| `sndFileProgressXFTP` / `sndFileCompleteXFTP` | upload lifecycle |
| `contactSubSummary`, `subscriptionStatus`, `networkStatus`, `networkStatuses` | connectivity |
| `connectionsDiff` | sent once on WS connect |
| `chatItemUpdated` / `chatItemsDeleted` | edits / deletions |

## Two shapes for chat items — do not confuse them

- `newChatItems` event: `chatItems: [{ chatInfo, chatItem: {chatDir, meta, content, file?} }]`
- `apiChat` response: `chat.chatItems: [{chatDir, meta, content, file?}]` (no `chatItem` wrapper)

## Database encryption — security notes

- The only official way to open an encrypted DB with the CLI is `-k KEY` on the
  command line. There is **no stdin/fd/env alternative in v6.5.6** (verified: no
  prompt is offered; the process just exits). The passphrase is therefore
  visible in the local process list (`ps`) for the lifetime of the core
  process. This is documented in `docs/KNOWN_LIMITATIONS.md`; the mitigation is
  that the DB is *created* encrypted (never plaintext on disk), the exposure is
  local-only, and any local observer with `ps` access is already inside the
  threat model's "compromised device" boundary.
- `/_db encryption` works only in maintenance mode (`chatNotStopped` otherwise)
  and `/_stop` kills the CLI, so key *changes* require a core restart.
- Verified fail-closed: without the key the DB files are `ErrorNotADatabase`
  (SQLCipher, random-looking header instead of `SQLite format 3`).

## Launcher process model (what these facts force)

```
first run  : simplex-chat -d <dir>/simplex_v1 -k <key> -p <rand port> -l error -y \
             --files-folder <dir>/files --temp-folder <dir>/tmp --device-name FWA
             → write "<displayName>\n" to stdin when prompted → chat runs
next runs  : same command + -m → WS up → /u (validates key) → /_start → chat runs
always     : stdin kept open; stdout/stderr discarded; SIGTERM on shutdown
wrong key  : process exits ≈ immediately → launcher reports "wrong password"
```

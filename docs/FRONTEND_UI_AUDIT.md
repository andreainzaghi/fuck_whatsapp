# Frontend UI Audit — pre-redesign (2026-07-10)

Audit of the frontend as it existed before the "FUCK WHATSAPP" premium
redesign. Scope is **frontend only** (`apps/web/src`); no backend, bridge,
launcher, crypto, API, persistence or security flow is in scope or was changed.

## 1. Framework & dependencies

| | |
|---|---|
| Framework | React 19.2 + TypeScript strict |
| Build | Vite 8, self-contained bundle (no CDN/fonts/analytics) |
| Routing | `react-router-dom` 7 (**HashRouter** — required: the app is served from a hash-routing SPA behind the bridge) |
| State | Zustand 5 (four stores) |
| QR | `qrcode` (render) + `jsqr` (scan), both local |
| Icons | none — a handful of inline SVGs duplicated inside `Composer.tsx` |
| Styling | CSS Modules per component + one global `styles/global.css` + `@fwa/ui/tokens.css` |

## 2. Routing & components map

```
main.tsx → captureBootstrap() → <App/>
App.tsx  → phase gate (boot/no-session/onboarding/unlock/starting/error/ready)
         → HashRouter (ready only)
           /chats            ChatList (mobile) | EmptyState (desktop, sidebar shows list)
           /chat/:contactId  Conversation → MessageBubble, Composer(→VoicePlayer), ImageOverlay
           /connect          Connect → InvitePanel, JoinPanel(→QrScanner)
           /network          Network → OperatorCard → ServerRow, AdvancedPanel
           /settings         Settings → SectionCard, InfoRow, DocRow, SecurityBadge
```

## 3. Data contracts (FROZEN — the redesign consumes these unchanged)

The store/lib layer is the app's internal API. The redesign restyles the views
that consume it but must not change any of these signatures:

- `useSessionStore`: `phase, coreVersion, user, errorCode, init(), create(name,pw), unlock(pw)`
- `useChatsStore`: `chats[], messages{}, activeContactId, wsStatus, startEventPump(), loadChats(), openChat(id), sendText(id,text), sendAttachment(id,blob,name,kind,extra), acceptFile(fileId)`
- `useConnectStore`: `invitation, creating, lastConnected, createInvitation(), acceptInvitation(link)`
- `useNetworkStore`: `operators[], load()`
- `lib/bridgeClient`: `fileUrl(absPath), uploadBlob(blob,name), deleteStaged(path)` + session/profile calls
- `lib/coreClient`: singleton WS (`connect/disconnect/send/onEvent/onStatus`)
- `lib/qr`: `renderQr(text, canvas)`, `scanQrFromVideo(video) → string|null`
- `lib/bootstrap`: `captureBootstrap()`, `takeBootstrap()`

## 4. Real states already exposed by the core (all must keep working)

`wsStatus` = connecting | open | closed. `SessionPhase` = boot | no-session |
onboarding | unlock | starting | ready | error (+ `errorCode` incl.
`wrong-password`). Message `status` = sndNew | sndSent | sndRcvd (+ rcv…).
File `fileStatus` = sndStored | rcvInvitation | rcv…complete. These drive
delivery ticks, unlock errors, download offers, reconnection UI.

## 5. Findings (what the redesign fixes)

| # | Area | Finding | Severity |
|---|------|---------|----------|
| F1 | Brand | No logotype, no brand voice, generic "topbar" with plain title. The product does not read as *FUCK WHATSAPP*. | high |
| F2 | Chat list | No search, no avatars (initials only later), thin rows, no skeleton, weak unread badge, no draft/last-message iconography (🎙/📎). Doesn't match the WhatsApp mental model. | high |
| F3 | Conversation | Bubbles are basic; no day separators polish, no unread separator, no scroll-to-bottom FAB, delivery ticks minimal, media rendering utilitarian. | high |
| F4 | Composer | Works and has correct a11y hooks, but visually flat; no attachment sheet (single hidden file input), no reply preview, no drag-and-drop/paste, voice UI has no waveform. | high |
| F5 | Attachments | No bottom-sheet, no media viewer (only a bare ImageOverlay), no upload progress affordance, no file-type iconography. | med |
| F6 | Onboarding | Functional but plain; no splash logotype, no brand manifesto, no memorable empty state. | high |
| F7 | Theme | Dark/light only via `prefers-color-scheme`; **no in-app Appearance control** (system/light/dark, text size). | med |
| F8 | Icons | Ad-hoc inline SVGs duplicated in one component; no coherent icon set. | med |
| F9 | Feedback | No toast system, no confirm dialog; Danger Zone actions would have nowhere to confirm. | med |
| F10 | States | Loading/empty exist; offline/reconnecting/failed-send/uploading/permission-denied are under-designed. | med |
| F11 | Desktop | Two-column shell exists but sidebar is a plain list; feels like a widened mobile view, not a desktop product. | med |
| F12 | Motion | No intentional micro-interactions; no `prefers-reduced-motion` handling. | low |

## 6. Accessibility baseline (kept & extended)

Good hooks already present and **preserved** by the redesign: labelled inputs
(`#ob-name`, `#ob-pw`, `#ob-pw2`, `#ul-pw`, `#ul-err`), `aria-label`s on the
composer (`Message`, `Send message`, `Attach a file`, `Record a voice message`,
`Stop recording`, `Send voice message`), tablist roles on Connect, real
`<button>`/`<textarea>` elements. Gaps addressed: visible focus rings, dialog
focus-trap, min 44px targets everywhere, no colour-only signals, reduced-motion.

## 7. Security posture (unchanged, re-verified)

No `localStorage`/`sessionStorage` writes of any data; the redesign keeps that
invariant (theme/appearance prefs go to a tiny IndexedDB keyval — non-sensitive
UI only, per the project rule). No remote assets, no fonts over the network, no
analytics, no service worker. The bridge CSP (`script-src 'self'`,
`style-src 'self'` + `style-src-attr 'unsafe-inline'`, `img-src 'self' data:
blob:`, `media-src 'self' blob:`) is respected: CSS Modules + inline `style`
attributes for dynamic values only, no inline `<script>`, no external origins.

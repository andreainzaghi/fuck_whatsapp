# FWA Security Architecture

This document describes the complete security architecture of FWA ("FUCK
WHATSAPP") — a local React web UI plus a Node launcher/bridge in front of the
**unmodified official SimpleX Chat CLI v6.5.6** (binary reports `6.5.6.1`,
AGPL-3.0). Every protocol claim in this document is backed by the empirical
verification log in [`docs/SIMPLEX_INTEGRATION.md`](./SIMPLEX_INTEGRATION.md);
accepted residual risks are catalogued in
[`docs/KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).

Honest baseline, stated once and never exceeded anywhere in the app or docs:

> Content is end-to-end encrypted. It can be read on participating devices
> after decryption.

FWA never claims to be "unhackable" or "100% secure". A compromised local
device (same-user malware, memory access, `ps` access) is **outside** the
defended boundary.

---

## 1. Architecture diagram

```
┌─────────────────────────────────────────────────── local machine ───────────────────────────────────────────────────┐
│                                                                                                                      │
│  ┌──────────────────────┐        ┌───────────────────────────────┐        ┌──────────────────────────────┐          │
│  │  Browser             │        │  FWA launcher + bridge        │        │  SimpleX Chat CLI v6.5.6     │          │
│  │  (React UI)          │        │  (Node, single process)       │        │  (official, unmodified)      │          │
│  │                      │  HTTP  │                               │   WS   │                              │          │
│  │  http://127.0.0.1:   │◄──────►│  binds 127.0.0.1:<rand> ONLY  │◄──────►│  -p <rand>, VERIFIED to      │          │
│  │  <rand>/#b=<code>    │        │                               │        │  bind 127.0.0.1 only         │          │
│  │                      │  WS    │  • static frontend + CSP      │        │                              │          │
│  │  session: HttpOnly   │◄──────►│  • /api/* (cookie auth)       │        │  • ALL cryptography          │          │
│  │  SameSite=Strict     │        │  • /api/ws → verbatim         │        │  • SQLCipher database        │          │
│  │  cookie (never       │        │    frame proxy to the core    │        │  • SMP/XFTP client           │          │
│  │  readable by JS)     │        │  • file staging/serving       │        │                              │          │
│  └──────────────────────┘        │    (realpath-confined)        │        └──────────────┬───────────────┘          │
│                                  │  • spawns/supervises core     │                       │                          │
│                                  └───────────────────────────────┘                       │ TLS (SimpleX protocols)  │
│                                                                                          │                          │
└──────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────────┘
                                                                                           ▼
                                                                        ┌──────────────────────────────────┐
                                                                        │  SimpleX network                 │
                                                                        │  SMP + XFTP relays               │
                                                                        │  (preset operators: SimpleX      │
                                                                        │  Chat Ltd, Flux — user-          │
                                                                        │  replaceable; .onion hostnames   │
                                                                        │  available; optional SOCKS5/Tor  │
                                                                        │  via FWA_SOCKS_PROXY)            │
                                                                        │  Relays see ciphertext, queue    │
                                                                        │  ids, timing, sizes — never      │
                                                                        │  content.                        │
                                                                        └──────────────────────────────────┘
```

Key facts about the picture:

- Nothing ever binds `0.0.0.0`. The bridge binds `127.0.0.1` explicitly
  (`server.listen(port, '127.0.0.1', ...)` in
  [`packages/simplex-bridge/src/bridge.ts`](../packages/simplex-bridge/src/bridge.ts))
  and the core's `-p` WebSocket server was verified with `lsof` to bind
  `127.0.0.1` only.
- Both ports are random and change on every launch
  (`randomFreePort()` in [`apps/launcher/src/index.ts`](../apps/launcher/src/index.ts)).
- The only network traffic that leaves the machine goes to the SimpleX relays
  configured in the core. There is **zero** proprietary backend, and no
  Google/Meta/AWS/Firebase/analytics/CDN traffic of any kind.

## 2. Trust boundaries and what crosses each

### Boundary A — browser page ↔ bridge (`127.0.0.1:<bridge port>`)

| Crosses | Direction | Protection |
|---|---|---|
| One-time bootstrap code | browser → bridge, once | URL fragment (never sent in HTTP requests by browsers), single use, 5-minute TTL, max 10 attempts, constant-time compare ([`auth.ts`](../packages/simplex-bridge/src/auth.ts)) |
| Session cookie | both ways, every request | HttpOnly + SameSite=Strict; unreadable by page JavaScript |
| Profile passphrase / display name | browser → bridge (`/api/profile/*`) | loopback only, body caps, never stored, never logged |
| SimpleX WS frames (`{corrId, cmd}` / responses) | both ways over `/api/ws` | shape-validated, size- and rate-limited, relayed verbatim, never inspected semantically ([`wsProxy.ts`](../packages/simplex-bridge/src/wsProxy.ts)) |
| Attachment bytes | browser → `/api/upload`, bridge → browser via `/api/file` | 100 MB cap, staged under random UUID names, realpath-confined serving ([`files.ts`](../packages/simplex-bridge/src/files.ts)) |

Threats defended at this boundary: other websites open in the same browser
(CSRF, DNS rebinding, cross-origin WS), XSS inside the app page (see §4),
port-scanning local web pages. Enforcement, in order, on **every** request
(`handle()` in [`bridge.ts`](../packages/simplex-bridge/src/bridge.ts)):

1. remote socket must actually be loopback (`isLoopbackSocket`) — headers
   cannot lie about the TCP peer;
2. strict `Host` allowlist: exactly `127.0.0.1:<port>`, `localhost:<port>`,
   `[::1]:<port>` — defeats DNS rebinding, because a page at
   `attacker.example` resolving to 127.0.0.1 still sends
   `Host: attacker.example` ([`guards.ts`](../packages/simplex-bridge/src/guards.ts));
3. `Origin` required and validated on all state-changing requests and on the
   WS upgrade;
4. session cookie validated (SHA-256 digests compared with
   `timingSafeEqual`);
5. rate limits (session 10/min, api 120/min, upload 30/min, file 240/min,
   WS 300 messages/10 s) and payload caps (upload 100 MB, WS frame 1 MB,
   JSON bodies 4–8 KB).

### Boundary B — bridge ↔ SimpleX core (`127.0.0.1:<core port>`)

| Crosses | Direction | Protection |
|---|---|---|
| WS frames (commands/events, contain plaintext by design of the core API) | both ways | loopback only; the bridge relays without storing or logging |
| DB passphrase | launcher → core, as `-k` argv | see Known Limitation 1 below |
| Display name (first run) | launcher → core stdin | kept out of the process argument list on purpose |
| File paths (`--files-folder`, staged uploads) | both ways | confined directories inside the profile dir |

**Known limitation 1 (accepted):** the CLI accepts the DB key **only** via the
`-k` command-line argument — verified: no stdin/env/fd alternative exists in
v6.5.6 — so the passphrase is visible in the local process list (`ps`) while
the core runs. **Known limitation 2 (accepted):** the core's own WS port has
no authentication; any same-user local process could connect to it. Both are
inside the accepted threat boundary: a same-user local attacker can equally
read process memory. The bridge's authentication exists to protect against
the *browser-borne* attacker (other origins), not against local malware.

### Boundary C — core ↔ SimpleX network (relays)

| Crosses | Direction | What relays can/cannot see |
|---|---|---|
| E2E-encrypted messages, XFTP-encrypted file chunks | both ways | relays see ciphertext, queue ids, timing and sizes — they **cannot** read content |

Servers are the SimpleX default preset operators (SimpleX Chat Ltd, Flux),
fully user-replaceable via the core's `/_servers` command; onion hostnames
are present in the presets and `--socks-proxy` (env `FWA_SOCKS_PROXY`) routes
everything through Tor/SOCKS5.

### Boundary D — out-of-band invitation exchange

Invitation links (`simplex:/invitation#/...`) transit over whatever channel
the user chooses (in person, another messenger, QR scan). A man-in-the-middle
on that channel is mitigated by out-of-band verification and SimpleX security
codes — FWA surfaces the link/QR but cannot make the user's chosen channel
trustworthy, and does not claim to.

## 3. Cryptography responsibility statement

**100% of the cryptography lives in the unmodified official SimpleX Chat core.
FWA implements ZERO cryptography.**

What the core (and only the core) provides:

- **End-to-end encryption** with the **double ratchet** algorithm;
- **X3DH-like key agreement** for connection establishment;
- **Forward secrecy** and **post-compromise security** from the ratchet;
- **Unidirectional messaging queues** (SMP) — no user identifiers, no phone,
  no email, no central account;
- **XFTP encrypted file transfer** (attachments, images, voice notes travel
  as encrypted chunks);
- **SQLCipher encryption of the local database** (see §7).

What FWA adds is strictly *transport plumbing and access control around a
loopback socket*: session bootstrap, header validation, rate limiting, file
confinement. The frontend and bridge treat SimpleX frames as opaque payloads
(`SxRequest`/`SxEnvelope` in
[`packages/shared-types/src/simplex.ts`](../packages/shared-types/src/simplex.ts)
are read-only *descriptions* of the official protocol, not an implementation).

Binary provenance: downloaded from the official GitHub release for v6.5.6.
Linux checksums are pinned from the official signed `_sha256sums`
(`ubuntu-22_04-x86_64
eaa3106616a39acdca75b2312d56e41babb6ebca54204c943a992ec4b9461154`,
`ubuntu-24_04-x86_64
0aec0a1ebd35ec3dfbb9f969f5d58e4269c8eca236f5be096780b9465dda2dbe`). The
official `_sha256sums` covers only Linux assets, so for macOS FWA pins its own
hash computed at integration time over TLS from the official repo
(`macos-aarch64
06eedfcad8cbf31abb2c13892592a1a532c4043c4954be645dfe8a1447ee9066`) — a
trust-on-first-use decision, documented as Known Limitation 3. The launcher
additionally refuses to start unless `--version` reports
`SimpleX Chat v6.5.6` ([`apps/launcher/src/index.ts`](../apps/launcher/src/index.ts)).

## 4. Bridge authentication design

Implementation: [`packages/simplex-bridge/src/auth.ts`](../packages/simplex-bridge/src/auth.ts);
contract: [`packages/shared-types/src/bridge.ts`](../packages/shared-types/src/bridge.ts).

```
launcher start
  │  mints bootstrapCode = randomBytes(32).base64url          (new every launch)
  │  prints http://127.0.0.1:<rand>/#b=<code> once to the interactive
  │  terminal (never written to any file) and opens the browser
  ▼
browser loads page, reads code from the URL FRAGMENT
  │  (fragments are never sent in HTTP requests; the frontend strips it
  │   from the address bar on first paint)
  ▼
POST /api/session {bootstrap}          ── single use, 5-min TTL, ≤10 attempts,
  │                                       rate-limited 10/min, timing-safe compare
  ▼
Set-Cookie: fwa_session=<randomBytes(32)>; Path=/; HttpOnly; SameSite=Strict
  │
  ▼
every /api/* request and the /api/ws upgrade must present the cookie
(plus loopback socket + Host allowlist + Origin validation, §2-A)
```

### Why an HttpOnly cookie beats a JS-held token under XSS

The realistic worst case for a local web UI is a script-injection bug in the
frontend. Compare the two designs under that assumption:

- **JS-held token** (in memory or — forbidden here — web storage): injected
  script reads the token and can exfiltrate it or replay it from anywhere,
  turning one XSS into a durable, portable credential.
- **HttpOnly cookie**: injected script *cannot read the credential at all*.
  It can still issue same-origin requests while the page is open (that
  residual risk is inherent to XSS), but it cannot steal the session, cannot
  persist access beyond the page's life, and cannot hand the credential to a
  remote attacker. The CSP (§8) independently makes injecting a script body
  extremely hard in the first place (`script-src 'self'`, no inline scripts).

`SameSite=Strict` additionally keeps the cookie off any cross-site request,
including navigations from hostile pages and DNS-rebinding attempts (whose
`Host` also fails validation). The cookie carries no `Secure` attribute
because the origin is plain HTTP on loopback — the traffic never transits a
network. One session per bridge run; a new token and new random ports are
minted at every launch, so nothing about a previous session is reusable.

The bootstrap code travels in the **fragment** (`#b=...`) specifically
because fragments are not sent to servers, do not appear in `Referer` headers
(and the app sends `Referrer-Policy: no-referrer` anyway), and can be wiped
from the address bar immediately.

## 5. Process model and lifecycle

Implementation: [`apps/launcher/src/core-process.ts`](../apps/launcher/src/core-process.ts)
and [`apps/launcher/src/index.ts`](../apps/launcher/src/index.ts).

Spawn command (create mode; open mode adds `-m` for maintenance start):

```
simplex-chat -d <profile>/simplex_v1 -p <random loopback port> -l error -y \
             --files-folder <profile>/files --temp-folder <profile>/tmp \
             --device-name FWA --auto-accept-files 5242880 -k <passphrase>
```

Security invariants enforced by the launcher:

- **stdout/stderr are ignored at the OS level** — `stdio: ['pipe', 'ignore',
  'ignore']`. This is not stylistic: the CLI **echoes every received WS
  command to stdout even at `-l error`** (verified, e.g.
  `received command "1" : "/db encrypt <key>"`), so core stdout is a
  plaintext-and-secrets leak channel. Discarding it at spawn time means no
  FWA code path can ever read, buffer, or log it.
- **stdin discipline**: stdin stays open for the core's entire life (EOF
  kills the process — verified `hGetLine: end of file`) and is written
  exactly once, on first run, to answer the `display name:` prompt. This
  keeps the display name out of the process argument list.
- **Passphrase handling**: `-k` is the only mechanism the CLI supports
  (Known Limitation 1, §2-B). The launcher does not retain the passphrase
  after the spawn call returns, never stores it, never logs it.
- **Readiness probing**, not log parsing: the launcher polls the core WS with
  `/u` (and `/_start` in maintenance mode) until it answers, instead of
  reading process output.
- **Fail-closed wrong password**: with a wrong/missing key the core exits
  almost immediately (`SQLite3 returned ErrorNotADatabase`). The launcher
  maps that exit in open mode to `wrong-password` for the UI — no plaintext
  fallback exists anywhere.
- **Shutdown**: `SIGTERM`, 5-second grace, then `SIGKILL`; the bridge wipes
  the staging directory and closes all WS clients first (`bridge.close()`).
  SIGINT/SIGTERM on the launcher tear down bridge and core together.

Lifecycle states exposed to the UI (`CoreStatus` in
[`packages/shared-types/src/bridge.ts`](../packages/shared-types/src/bridge.ts)):
`no-profile → starting → running`, `locked → starting → running`,
`wrong-password`, `error` — with sanitized `errorCode` values only.

## 6. Logging policy

Implementation: [`packages/simplex-bridge/src/log.ts`](../packages/simplex-bridge/src/log.ts).

A log line may contain **only**: ISO timestamp, component name, event code,
optional correlation id. The logger's API makes violations *structurally*
hard, not just forbidden by convention:

- the `log(component, code, corrId?)` signature has **no free-text
  parameter**;
- `component` is a closed union (`launcher | bridge | core | files | wsproxy
  | auth`);
- `code` is a closed union of fixed event codes (`listen`, `spawn`, `ready`,
  `session_created`, `bootstrap_rejected`, `auth_fail_host`,
  `ws_frame_rejected`, `upload_ok`, `file_denied`, `staging_cleaned`, …).

Therefore it is impossible, through this logger, to log message text, contact
names, file names, personal paths, invitation links, SimpleX addresses,
passwords, tokens, or WebSocket payloads — there is simply no parameter to
put them in. The other potential leak channel, core stdout/stderr, is closed
at the OS level (§5). The frontend never calls `console.log`/`console.error`
with content either; errors surface as the sanitized `ApiError` codes defined
in [`packages/shared-types/src/bridge.ts`](../packages/shared-types/src/bridge.ts).

## 7. Data at rest

Everything lives under the profile directory
(`runtime/profiles/default/` by default, overridable via `FWA_PROFILE_DIR`):

| Path | Contents | Protection |
|---|---|---|
| `simplex_v1_chat.db`, `simplex_v1_agent.db` | all chat state | **SQLCipher-encrypted by the core, born encrypted**: created with `-k` on a fresh DB, so a plaintext database never exists on disk, not even transiently. Verified: the file header is random bytes, not `SQLite format 3`, and opening without/with a wrong key fails closed (`ErrorNotADatabase`, process exits). |
| `files/` | received attachments, decrypted | plain files by design — this is the user's received-files folder. Served to the UI only through `/api/file` with realpath confinement. |
| `tmp/` | core's temp encrypted files (`--temp-folder`) | managed by the core |
| `staging/` | outgoing uploads awaiting `/_send` | random UUID-prefixed names (`stageUpload` in [`files.ts`](../packages/simplex-bridge/src/files.ts)); deletable via `DELETE /api/file` (staging **only** — received files are never deletable through the API); the whole directory is wiped at shutdown (`cleanStaging`). |

File-serving confinement: `/api/file` resolves the requested path with
`realpath` and serves it only if it is strictly inside `files/` or
`staging/` — symlink escapes and `/allowed-evil` sibling-prefix tricks are
rejected (`confinePath` in [`files.ts`](../packages/simplex-bridge/src/files.ts)).
Unknown MIME types are forced to `application/octet-stream` +
`Content-Disposition: attachment` + `nosniff`.

**What is deliberately NOT stored:**

- **No parallel database.** The bridge holds no chat state; the SimpleX core
  is the only source of truth (see the header of
  [`packages/simplex-bridge/src/bridge.ts`](../packages/simplex-bridge/src/bridge.ts)).
- **No web storage.** Zero `localStorage`, `sessionStorage`, or IndexedDB
  usage in the frontend — chat data never touches browser-managed storage,
  and the session credential could not be put there anyway (HttpOnly).
- **No log files with content** (§6), no core stdout capture (§5).
- **No copy of the bootstrap code or session token on disk** — the launch URL
  is printed once to the interactive terminal only.
- **No passphrase persistence** — it exists in the browser form, one loopback
  POST body, and the core's argv (Known Limitation 1); the launcher does not
  retain it.

## 8. HTTP security headers and CSP

Set on every static response by `securityHeaders()` in
[`packages/simplex-bridge/src/bridge.ts`](../packages/simplex-bridge/src/bridge.ts);
API responses add `nosniff` and `Cache-Control: no-store`.

Content-Security-Policy, directive by directive:

| Directive | Value | Rationale |
|---|---|---|
| `default-src` | `'none'` | deny-by-default; every capability below is an explicit exception |
| `script-src` | `'self'` | only bundled, same-origin scripts execute — no inline scripts, no `eval`, no remote code. Primary XSS mitigation. |
| `style-src` | `'self'` | only bundled stylesheets (CSS Modules); no remote or injected `<style>` sheets |
| `style-src-attr` | `'unsafe-inline'` | React sets `style=""` attributes for dynamic values (progress bars, layout). Attribute styles cannot load external resources or run script; `<style>` element injection stays blocked by `style-src`. |
| `img-src` | `'self' data: blob:` | app assets, QR-code data URIs and SimpleX image thumbnails (`data:`), locally-generated object URLs (`blob:`). No remote images — no tracking pixels. |
| `media-src` | `'self' blob:` | voice-note/video playback of local bytes only |
| `connect-src` | `'self' ws://127.0.0.1:<port> ws://localhost:<port>` | fetch/WS strictly to the bridge's own loopback origin; exfiltration to any remote host is blocked by policy |
| `font-src` | `'self'` | bundled fonts only; no remote font foundries |
| `worker-src` | `'self'` | same-origin workers only (and no service workers are used at all, §9) |
| `frame-ancestors` | `'none'` | the app cannot be framed — kills clickjacking (mirrored by `X-Frame-Options: DENY`) |
| `object-src` | `'none'` | no plugins/embeds |
| `base-uri` | `'none'` | `<base>` injection cannot redirect relative URLs |
| `form-action` | `'self'` | forms cannot be re-targeted to remote endpoints |
| `manifest-src` | `'self'` | local manifest only |

Companion headers:

| Header | Value | Rationale |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | no MIME sniffing — served attachments with unknown types stay inert downloads |
| `X-Frame-Options` | `DENY` | legacy-browser mirror of `frame-ancestors 'none'` |
| `Referrer-Policy` | `no-referrer` | nothing about the local origin (port, paths) leaks in outbound navigation |
| `Cross-Origin-Opener-Policy` | `same-origin` | isolates the browsing context from cross-origin openers |
| `Cross-Origin-Resource-Policy` | `same-origin` | bridge responses (including files) cannot be embedded by other origins |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=(), payment=(), usb=()` | camera/mic only for same-origin use (QR scanning, voice notes); everything else denied outright |
| `Cache-Control` | `no-store` (dynamic/API/files), `immutable` only for hashed `/assets/` | chat-adjacent bytes are never cached; only content-hashed static bundles are |

## 9. What FWA deliberately does NOT do

- **No telemetry, no analytics, no crash reporters.** Not "anonymized", not
  "opt-out" — none. The only outbound traffic is the core's SimpleX relay
  traffic (§2-C).
- **No remote assets.** No CDN scripts, no remote fonts, no remote images.
  The app is fully self-contained and works offline against the local bridge;
  CSP makes remote loads a policy violation, not just a habit.
- **No service workers.** Nothing can intercept requests, persist beyond the
  page, or receive push events. `script-src 'self'` plus the absence of any
  registration code enforces this.
- **No web storage.** No `localStorage`/`sessionStorage`/IndexedDB (§7) —
  nothing chat-related survives in the browser profile.
- **No key export, no key handling at all.** FWA has no feature to export,
  display, back up, or transmit ratchet keys or the DB passphrase. Key
  material stays inside the core's SQLCipher database; the bridge and
  frontend never see ratchet state.
- **No parallel persistence of chat data** — no shadow database, no message
  cache on the bridge, no content-bearing logs (§6, §7).
- **No cryptography of its own** (§3) — FWA does not "improve" or wrap the
  core's crypto; it would only add attack surface.
- **No accounts, no phone numbers, no email** — inherited from SimpleX's
  design; FWA adds no identity layer of its own.
- **No non-loopback listeners** — nothing to firewall, nothing exposed to
  the LAN.
- **No proprietary or third-party backend services** of any kind.

Production dependency surface (kept deliberately small, all pinned exact,
`npm audit` clean at build time — 0 vulnerabilities): `react`, `react-dom`,
`react-router-dom`, `zustand`, `qrcode`, `jsqr`, `ws`.

---

### Related documents

- [`docs/SIMPLEX_INTEGRATION.md`](./SIMPLEX_INTEGRATION.md) — empirically
  verified core API reference (the only trusted API source).
- [`docs/KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) — honest catalogue of
  accepted residual risks (`-k` visibility in `ps`, unauthenticated core WS
  port, TOFU macOS checksum, webm/opus voice-note interop).
- `THIRD_PARTY_NOTICES` — SimpleX attribution (FWA is AGPL-3.0-only and does
  not use the SimpleX name or logo as branding).

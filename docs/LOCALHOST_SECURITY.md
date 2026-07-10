# Localhost Is Not a Security Boundary — How FWA Hardens It

"It only listens on 127.0.0.1" is one of the most common false reassurances in
local-app security. Binding to loopback stops *remote hosts* from opening a TCP
connection — and nothing else. Two large classes of attackers remain fully in
play:

1. **Your own browser.** Every web page you visit runs code that can send HTTP
   requests and open WebSockets to `http://127.0.0.1:<port>`. The request
   originates from *your* machine, over *your* loopback interface, and reaches
   any local server that trusts loopback traffic. This is how drive-by attacks
   against local dev servers, debuggers, and wallet daemons work in practice.
2. **Other processes on the machine.** Loopback is shared by every local user
   and process. A port that answers to "anything that can connect to
   127.0.0.1" answers to all of them.

FWA (bridge + core) assumes localhost is hostile and defends each of these
paths with a specific, verifiable mechanism. Every claim below maps to code in
`packages/simplex-bridge/src/` (`bridge.ts`, `auth.ts`, `guards.ts`,
`wsProxy.ts`) and can be exercised with the curl commands at the end.

Scope note: these defenses harden the *browser-facing* surface. They do not —
and cannot — protect against malware already running as your OS user; see
[Same-user local processes](#4-other-local-users-and-processes) and
[KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

---

## 1. Drive-by web pages calling `http://127.0.0.1`

**The attack.** A page on `evil.example` runs
`fetch('http://127.0.0.1:8080/api/...', {method:'POST', ...})` in a loop over
candidate ports. The browser happily sends the request; only *reading* the
response is gated by CORS. So a local server that performs state changes on
POST is exploitable even if the attacker never sees the reply ("CORS blind"
attacks). Simple `<form>` posts and `<img src>` GETs bypass CORS preflight
entirely.

**FWA's defenses (layered):**

- **No CORS headers at all.** The bridge never sends
  `Access-Control-Allow-Origin` — there is no wildcard, no reflection, nothing.
  A cross-origin page can never read any bridge response.
- **Origin validation, not just absence of CORS.** Every state-changing request
  (any method other than GET/HEAD) **requires** an `Origin` header and it must
  be exactly `http://127.0.0.1:<port>`, `http://localhost:<port>`, or
  `http://[::1]:<port>` (`guards.ts: isValidOrigin`); a foreign `Origin` is
  rejected even on GET when the header is present. Browsers attach the true
  page origin automatically and page script cannot forge it. `evil.example`'s
  POST arrives with `Origin: https://evil.example` and is rejected with
  **403 `bad-origin`** before any handler logic runs. A `<form>` post carries
  the forging page's origin too — same rejection.
- **Authentication on everything.** All `/api/*` routes except the one-time
  `/api/session` exchange require the session cookie (see section 5). A
  drive-by request has no way to obtain the token: it is stored in an
  **HttpOnly** cookie (invisible to all JavaScript, including FWA's own) with
  **SameSite=Strict**, so the browser refuses to attach it to any request
  initiated by a cross-site page in the first place. Result: **401
  `unauthorized`**.
- **Random port per launch.** The attacker cannot even hardcode the target
  port; scanning is met by the checks above on every port guess.

So a drive-by page fails four independent checks: it cannot read responses
(no CORS), cannot pass Origin validation, cannot present the cookie
(SameSite=Strict + HttpOnly), and does not know the port.

## 2. DNS rebinding

**The attack, step by step.** DNS rebinding is the classic trick for turning a
remote page into a *same-origin* client of your local server:

1. You visit `http://attacker.example/`, which resolves to the attacker's real
   server (e.g. `203.0.113.7`). The page loads and starts a script.
2. The attacker's DNS server answers with a very low TTL. After a few seconds
   it *rebinds*: `attacker.example` now resolves to `127.0.0.1`.
3. The still-open page issues `fetch('http://attacker.example:<port>/api/...')`.
   The browser re-resolves the name, connects to **127.0.0.1** — your loopback
   — while considering the request **same-origin** with the page. CORS no
   longer applies at all: the page can read every response byte.
4. Any local server that answers based on "the socket is loopback" is now fully
   scriptable and readable by a remote attacker.

**Why FWA's Host check kills it.** The one thing the rebinding page *cannot*
change is the `Host` header: the browser sets it to the URL's hostname, so the
request arrives as `Host: attacker.example:<port>`. The bridge validates
`Host` on **every single request** (and on WebSocket upgrades) against a strict
allowlist of exactly three values (`guards.ts: isValidHost`):

```
127.0.0.1:<port>   localhost:<port>   [::1]:<port>
```

`attacker.example:<port>` is not in the set, so the request is rejected with
**403 `bad-origin`** before routing. There is no substring matching, no suffix
matching, no regex — set membership on the exact string, port included. The
rebound page gets a 403 error body and nothing else. As backstops, the session
cookie is scoped to the real origin (a rebound `attacker.example` origin has no
cookie), and the Origin header on state-changing requests would fail too.

## 3. WebSocket hijacking — WS is *not* protected by CORS

**The attack.** This one surprises people: **the WebSocket handshake is exempt
from the Same-Origin Policy and CORS entirely.** Any web page may execute
`new WebSocket('ws://127.0.0.1:<port>/api/ws')`, complete the handshake, and
then **read every frame** the server sends — full duplex, no CORS check ever.
This is Cross-Site WebSocket Hijacking (CSWSH). A local WS endpoint that speaks
to a chat core without checking who connected would hand plaintext message
traffic to any browser tab. Note that the SimpleX core's own WS port has
exactly this property, which is why FWA never exposes it to the browser — see
section 4.

**FWA's defenses on the `/api/ws` upgrade** (`bridge.ts`, `server.on('upgrade')`
— all checks run before the handshake completes):

1. **Loopback socket check** — non-loopback peers are dropped with no response.
2. **Path check** — only `/api/ws` is upgradable; anything else: socket
   destroyed.
3. **Strict Host allowlist** — same as section 2 (defeats rebinding on WS too).
4. **Origin required and validated.** Browsers always send `Origin` on WS
   upgrades and scripts cannot spoof it. It must be one of the three loopback
   origins; otherwise the socket receives a raw `HTTP/1.1 403 Forbidden` and
   is destroyed. This alone defeats CSWSH.
5. **Cookie authentication.** The upgrade request must carry the valid
   `fwa_session` HttpOnly cookie. A foreign page's WS handshake is a
   cross-site request, so SameSite=Strict means the browser will not attach the
   cookie: 403, destroyed.

Once connected, the proxy still does not trust the client: each frame must be
UTF-8 text (binary → close `1009`), at most 1 MB (→ close `1009`), within the
rate window of 300 messages per 10 s (→ close `1008`), and shaped exactly as
`{"corrId": string, "cmd": string}` JSON (→ close `1008`). The bridge validates
that envelope **without inspecting semantics** — frames carry decrypted chat
content by design of the core API, and the bridge never parses, stores, or
logs it.

## 4. Other local users and processes

**Why the loopback socket check is not enough.** The bridge verifies that
`req.socket.remoteAddress` is genuinely loopback (`127.0.0.1`, `::1`, or
`::ffff:127.0.0.1`) whatever the headers claim — anything else is destroyed
without a response. But *every local process passes that check*. Loopback is a
shared bus, not an identity. So FWA adds:

- **A random port on every launch** — a local snooper cannot assume a fixed
  target and, more importantly:
- **A random 256-bit session token on every launch**, delivered only through
  the flow in section 5, held in an HttpOnly cookie inside your browser
  profile. A different local *user* cannot obtain it (they cannot read your
  terminal or your browser's cookie jar), so every request they craft gets
  **401 `unauthorized`**. Token comparison is timing-safe
  (SHA-256 digests + `timingSafeEqual`), so it cannot be guessed byte-by-byte
  through response timing.
- **File confinement regardless of auth**: `/api/file` serves only
  realpath-confined paths inside the profile's `files/` and `staging/`
  directories; `DELETE` touches only `staging/`. Even a stolen session cannot
  read arbitrary disk paths through the bridge.

**The honest boundary: processes running as *your own* user.** Two verified
limitations live here, and no localhost hardening can remove them:

- The SimpleX core CLI (v6.5.6) accepts the database passphrase **only** via
  the `-k` command-line argument, so it is visible in the local process list
  (`ps`) while the core runs. Verified: no stdin/env/fd alternative exists.
- The core's own WS port (random, loopback-bound — verified with `lsof`) has
  **no authentication**. The bridge adds authentication for the browser
  surface, but a same-user local process could connect to the core port
  directly.

Both belong to the same threat boundary: a process running as your user can
already read your process list, your memory, and your keystrokes. It is inside
the "compromised device" line that no messenger can defend. Both are
documented, not hidden — see [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

## 5. The bootstrap token design

How does the browser get a session in the first place, without the token ever
being exposed? (`auth.ts`)

1. At launch, the bridge mints a **32-byte random bootstrap code**
   (base64url) and builds `http://127.0.0.1:<port>/#b=<code>`. The code is
   **printed once to the interactive terminal** (as part of the URL) and the
   browser is opened on it. It is **never written to any file or log**.
2. The code travels in the **URL fragment** (`#b=...`). Fragments are never
   sent in HTTP requests — the bridge's access path never sees it, it cannot
   appear in any server-side artifact, and an on-path observer of the request
   line sees nothing (moot anyway on loopback, but the property is free).
3. The frontend reads the fragment on first paint, immediately removes it from
   the address bar with `history.replaceState` (so it does not linger in the
   visible URL or session history entry), and exchanges it via
   `POST /api/session`.
4. The bridge validates it with a **timing-safe comparison** and hard limits:
   **single-use** (consumed on first success), **5-minute TTL** from launch,
   and a lifetime cap of **10 attempts** — after which the code is dead even if
   correct. Wrong, expired, replayed, or over-attempted codes all yield
   **403 `bad-bootstrap`** (the response never distinguishes which check
   failed).
5. On success the bridge mints a fresh **32-byte session token** and sets it as
   `fwa_session; Path=/; HttpOnly; SameSite=Strict`. JavaScript can never read
   it (HttpOnly), so even an XSS bug in the frontend could not exfiltrate the
   token; cross-site pages can never send it (SameSite=Strict). There is no
   `Secure` attribute because the origin is plain `http://127.0.0.1` — traffic
   never leaves the loopback interface, and `Secure` would make the cookie
   unusable there. One session per bridge run; everything dies with the
   process.
6. Next launch: new port, new bootstrap code, new session token.

All frontend calls use `fetch(..., {credentials:'same-origin'})` (explicit,
though it is the same-origin default), and the browser attaches the cookie to
the `ws://127.0.0.1:<port>/api/ws` upgrade automatically.

## 6. Rate limits and payload caps

All limiters are sliding-window and in-memory (`guards.ts`); body reads are
hard-capped and the socket is destroyed the moment a cap is exceeded, so
nothing beyond the cap is ever buffered.

| Surface | Limit | Over-limit behavior |
|---|---|---|
| `POST /api/session` | 10 / min | 429 `rate-limited` |
| Other `/api/*` JSON routes (status, profile, file DELETE) | 120 / min | 429 `rate-limited` |
| `POST /api/upload` | 30 / min | 429 `rate-limited` |
| `GET /api/file` | 240 / min | 429 `rate-limited` |
| WS messages (per connection) | 300 / 10 s | close `1008` |

| Payload | Cap | Over-cap behavior |
|---|---|---|
| `POST /api/session` body | 4 KB | 413 `payload-too-large`, socket destroyed |
| Profile create/open bodies | 8 KB | 413 `payload-too-large`, socket destroyed |
| `POST /api/upload` body | 100 MB | 413 `payload-too-large`, socket destroyed |
| WS frame | 1 MB | close `1009` |

## 7. Exact reject behavior

Checks run in this order on every HTTP request:

| Condition | Response |
|---|---|
| Socket peer is not loopback | connection destroyed, **no response at all** |
| `Host` not in allowlist | **403** `{"ok":false,"code":"bad-origin"}` |
| Bad/expired/replayed bootstrap on `/api/session` | **403** `{"ok":false,"code":"bad-bootstrap"}` |
| Missing/invalid session cookie on `/api/*` | **401** `{"ok":false,"code":"unauthorized"}` |
| Missing `Origin` on state-changing method, or foreign `Origin` on any method | **403** `{"ok":false,"code":"bad-origin"}` |
| Rate limit exceeded | **429** `{"ok":false,"code":"rate-limited"}` |
| Body over cap | **413** `{"ok":false,"code":"payload-too-large"}` + socket destroyed |
| Unknown `/api/*` route | **404** `{"ok":false,"code":"bad-request"}` |

WebSocket upgrade rejects:

| Condition | Behavior |
|---|---|
| Non-loopback peer, or path other than `/api/ws` | socket destroyed silently |
| Bad Host / bad Origin / bad cookie / core not running | raw `HTTP/1.1 403 Forbidden`, then socket destroyed |
| In-connection: binary or oversized frame | close code `1009` |
| In-connection: rate exceeded or invalid `{corrId, cmd}` envelope | close code `1008` |

Every rejection is logged as a fixed-vocabulary event code only
(`auth_fail_host`, `auth_fail_origin`, `auth_fail_token`,
`bootstrap_rejected`, `rate_limited`, `ws_frame_rejected`, ... — see
`packages/simplex-bridge/src/log.ts`). No header values, no paths, no content
ever reach a log.

## 8. Verify it yourself

Start the app (`npm run dev`), note the port in the browser address bar
(e.g. `http://127.0.0.1:52731/#b=...`), and export it:

```sh
PORT=52731   # <- your port
```

**1. No session cookie → 401.**

```sh
curl -i http://127.0.0.1:$PORT/api/status
# HTTP/1.1 401 Unauthorized
# {"ok":false,"code":"unauthorized"}
```

**2. Simulated DNS rebinding (foreign Host) → 403.**

```sh
curl -i -H 'Host: attacker.example' http://127.0.0.1:$PORT/api/status
# HTTP/1.1 403 Forbidden
# {"ok":false,"code":"bad-origin"}
```

**3. Cross-origin POST (drive-by page) → 403.**

```sh
curl -i -X POST http://127.0.0.1:$PORT/api/session \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  -d '{"bootstrap":"xxxxxxxxxxxxxxxx"}'
# HTTP/1.1 403 Forbidden
# {"ok":false,"code":"bad-origin"}
```

**4. Missing Origin on a state-changing request → 403.**

```sh
curl -i -X POST http://127.0.0.1:$PORT/api/session \
  -H 'Content-Type: application/json' \
  -d '{"bootstrap":"xxxxxxxxxxxxxxxx"}'
# HTTP/1.1 403 Forbidden
# {"ok":false,"code":"bad-origin"}
```

**5. Correct Origin but wrong bootstrap code → 403 (and single-use: even the
real code fails after first use).**

```sh
curl -i -X POST http://127.0.0.1:$PORT/api/session \
  -H "Origin: http://127.0.0.1:$PORT" \
  -H 'Content-Type: application/json' \
  -d '{"bootstrap":"definitely-not-the-right-code"}'
# HTTP/1.1 403 Forbidden
# {"ok":false,"code":"bad-bootstrap"}
```

**6. Session rate limit → 429 after 10 attempts inside a minute.**

```sh
for i in $(seq 1 12); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:$PORT/api/session \
    -H "Origin: http://127.0.0.1:$PORT" -H 'Content-Type: application/json' \
    -d '{"bootstrap":"definitely-not-the-right-code"}'
done
# 403 (x10) then 429 429
```

**7. WebSocket hijack attempt without the cookie → raw 403.**

```sh
curl -i http://127.0.0.1:$PORT/api/ws \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  -H "Origin: http://127.0.0.1:$PORT"
# HTTP/1.1 403 Forbidden
```

**8. Path traversal through the file endpoint → rejected before it even
matters (auth first; with a valid session it would still 404 on realpath
confinement).**

```sh
curl -i "http://127.0.0.1:$PORT/api/file?path=/etc/passwd"
# HTTP/1.1 401 Unauthorized
# {"ok":false,"code":"unauthorized"}
```

**9. Not reachable from the network at all.**

```sh
curl -i --max-time 3 "http://$(ipconfig getifaddr en0):$PORT/"   # macOS; use your LAN IP elsewhere
# curl: (7) Failed to connect ... Connection refused
lsof -nP -iTCP -sTCP:LISTEN | grep $PORT
# ...  TCP 127.0.0.1:52731 (LISTEN)     <- loopback only, never 0.0.0.0
```

---

None of this makes the app "secure" in the absolute sense — no software is.
Content is end-to-end encrypted by the unmodified SimpleX core; it can be read
on participating devices after decryption, and a compromised device is outside
what any of the mechanisms above can fix. What this document shows is
narrower and checkable: the localhost surface does not trust localhost, every
rejection path is explicit, and you can reproduce each one with a one-line
curl.

# FWA Threat Model

Status: current as of 2026-07-10, matching the code in this repository and the
empirical findings in `docs/SIMPLEX_INTEGRATION.md`. This document describes
what FWA defends against, what it explicitly does not, and where the residual
risk lies. It contains no marketing claims. **No application — including this
one — can promise absolute security.** Every claim below is scoped to a
specific adversary and capability.

---

## 1. System overview and trust boundaries

FWA is three local processes/surfaces on one machine plus the SimpleX relay
network:

```
Browser (React UI)
   │  HTTP + WS, 127.0.0.1 only, HttpOnly session cookie
   ▼
Bridge (Node, binds 127.0.0.1, random port per launch)
   │  transparent WS proxy, loopback only
   ▼
SimpleX Chat CLI v6.5.6 (official, unmodified, binds 127.0.0.1, random port)
   │  SMP / XFTP protocols (TLS; optional Tor via FWA_SOCKS_PROXY)
   ▼
SimpleX relays (default preset operators: SimpleX Chat Ltd, Flux; user-replaceable)
```

Key architectural facts this model relies on:

- **All cryptography lives in the unmodified official SimpleX core**
  (double ratchet, X3DH-like key exchange, per-contact queues, XFTP file
  encryption, forward secrecy, post-compromise security). FWA implements
  zero cryptography. FWA's own code is transport plumbing and UI.
- **Nothing binds to a non-loopback interface.** Both the bridge and the core
  WS server were verified to bind 127.0.0.1 only.
- **The database is SQLCipher-encrypted by the core**, created encrypted from
  the first write, and verified fail-closed: no key or a wrong key yields
  `ErrorNotADatabase` and the process exits. The on-disk header is random
  bytes, not `SQLite format 3`.
- **Bridge authentication**: a one-time bootstrap code delivered in the URL
  fragment (single-use, 5-minute TTL, max 10 attempts) is exchanged at
  `POST /api/session` for an HttpOnly `SameSite=Strict` session cookie. The
  token is never readable by page JavaScript. A new random token and new
  random ports are generated at every launch.
- **Perimeter checks on every request** (`packages/simplex-bridge/src/guards.ts`,
  enforced in `bridge.ts` before any handler): the remote socket must actually
  be loopback; the `Host` header must be exactly `127.0.0.1:<port>`,
  `localhost:<port>` or `[::1]:<port>`; `Origin` is required and validated on
  all state-changing requests and WS upgrades.
- **Rate limits and caps**: session 10/min, api 120/min, upload 30/min,
  file 240/min, WS 300 messages/10 s; upload bodies capped at 100 MB, WS
  frames at 1 MB. WS frames are validated as `{corrId: string, cmd: string}`
  JSON and relayed without semantic inspection.
- **Logging is structurally sanitized**: the logger
  (`packages/simplex-bridge/src/log.ts`) accepts only a fixed vocabulary of
  event codes — there is no free-text parameter, so message content, names,
  links and passwords cannot appear in logs. Core stdout/stderr is discarded
  at the OS level because the CLI echoes received commands (a verified leak
  channel).
- **File confinement**: `GET /api/file` serves only realpath-confined paths
  inside the profile's `files/` and `staging/` directories; `DELETE` only
  touches `staging/`. Uploads are staged under random UUID names; staging is
  wiped at shutdown.

### Documented limitations this model repeatedly cites

- **LIMITATION 1 (DB key in process list).** The CLI accepts the database
  passphrase only via the `-k` command-line argument. Verified: v6.5.6 offers
  no stdin/env/fd alternative. The passphrase is therefore visible to any
  same-user local process via `ps` while the core runs. (The display name, by
  contrast, is passed via stdin and does not appear in the argument list.)
- **LIMITATION 2 (unauthenticated core WS port).** The core CLI's WebSocket
  port (random, loopback-only) has no authentication of its own. The bridge
  adds authentication for the browser surface, but any same-user local
  process can connect to the core port directly.

Both limitations sit inside the same boundary: a local process running as the
same user. Such a process could equally read the core's memory, so these do
not expand the effective threat surface beyond "compromised device" —
but they are stated here because they make that compromise *easier* (no
memory-reading tooling required).

---

## 2. Assets

| Asset | Where it lives | Protected by |
|---|---|---|
| Message plaintext | Core memory; browser DOM while displayed; SQLCipher DB at rest | E2EE in transit (core); SQLCipher at rest; loopback-only + authenticated bridge locally |
| Contact identities / graph | SQLCipher DB; core memory | Same as above; relays never learn a user identity (no phone/email/account) |
| DB passphrase | User's head; core process argument list (LIMITATION 1); transient in bridge request body during create/open | HttpOnly-cookie-gated loopback POST; never stored; never logged |
| Session cookie / bootstrap code | HttpOnly cookie; URL fragment at launch only | Single-use, 5-min TTL, 10 attempts; cookie unreadable by JS; new per launch |
| Attachments | `files/` and `staging/` dirs; XFTP-encrypted in transit | realpath confinement; staging wipe; XFTP encryption by the core |
| Invitation links | Generated by core; shown in UI; transit out-of-band | Out-of-band delivery is the user's choice — see §4 and §5 |

---

## 3. Adversary summary

| # | Adversary / scenario | Can read message content? | Section |
|---|---|---|---|
| 1 | Malicious relay | **No** (ciphertext only) | §4.1 |
| 2 | ISP | No | §4.2 |
| 3 | Passive network observer | No | §4.3 |
| 4 | MITM on the invitation exchange | Only if unverified — reduced by out-of-band verification | §4.4 |
| 5 | Substituted invitation link | Talks to the wrong party, not decryption | §4.5 |
| 6 | Local malware (same user) | **Yes** | §5.1 |
| 7 | Malicious browser extension | **Yes** (DOM) | §5.2 |
| 8 | Stolen device | Depends — see matrix | §5.3 |
| 9 | Weak DB password | Yes, offline, given the files | §5.4 |
| 10 | Copied database files | No without passphrase; yes with it | §5.5 |
| 11 | XSS in the web UI | Would read DOM; multiple layers prevent | §6.1 |
| 12 | CSRF | No | §6.2 |
| 13 | DNS rebinding | No | §6.3 |
| 14 | Malicious web page probing localhost | No | §6.4 |
| 15 | Compromised npm dependency | Yes if it ships — supply-chain controls apply | §7.1 |
| 16 | Substituted SimpleX binary | Yes — hash pinning applies | §7.2 |
| 17 | Malicious attachment | Not via FWA itself; risk is in what opens it | §7.3 |
| 18 | Shoulder surfing / screenshots | **Yes** (screen shows plaintext) | §8.1 |
| 19 | Clipboard snooping | Copied text/links only | §8.2 |
| 20 | Crash dumps | Possibly (process memory) | §8.3 |
| 21 | OS swap | Possibly (paged memory) | §8.4 |

---

## 4. Network adversaries

### 4.1 Malicious relay

**Capability.** Operates one or more SMP/XFTP relays the user's core connects
to. Sees everything a relay sees: ciphertext, queue IDs, message timing and
sizes, connecting IP addresses (unless Tor is used). Can drop, delay, or
replay traffic; can attempt to correlate queues.

**Can achieve.** Denial of service on its own queues; traffic-analysis
metadata (timing, sizes, IP unless `FWA_SOCKS_PROXY` routes via Tor);
correlation attempts across the queues it hosts.

**Cannot achieve.** **A relay should not be able to read content.** Messages
are end-to-end encrypted by the core's double ratchet before they reach any
relay; files are XFTP-encrypted. Relays also have no user account, phone
number, or email to attach metadata to — SimpleX uses per-contact pairwise
queues, not user identifiers. A malicious relay cannot silently modify
content without breaking authentication inside the E2E protocol.

**Mitigations in FWA.** Traffic goes only to relays configured in the core
(default preset operators SimpleX Chat Ltd and Flux, replaceable via
`/_servers`); onion hostnames are present in the presets; `-x`/`--socks-proxy`
Tor support is exposed as `FWA_SOCKS_PROXY`. There is zero proprietary
backend and no third-party service (no Google/Meta/AWS/Firebase/analytics/CDN),
so the relay set is the *entire* network exposure.

**Residual risk.** Metadata: timing/size correlation by a relay operator, and
your IP address if not using Tor. Availability depends on relays behaving.

### 4.2 ISP

**Capability.** Sees all packets leaving the machine: destination IPs/ports,
TLS SNI, volumes, timing.

**Can achieve.** Learn that the user connects to SimpleX relays (or to a Tor
entry node), when, and roughly how much data moves. Block the traffic.

**Cannot achieve.** Read content (E2EE inside relay TLS), learn contact
identities, or learn message contents from sizes alone.

**Mitigations.** Tor via `FWA_SOCKS_PROXY` hides relay destinations from the
ISP; onion relay addresses avoid exit nodes. No FWA component ever contacts
any host other than the configured relays — there are no telemetry or update
endpoints to observe.

**Residual risk.** "This machine uses SimpleX (or Tor)" is itself observable
metadata. Traffic-volume/timing analysis is not defeated by encryption.

### 4.3 Passive network observer (Wi-Fi sniffer, tap, IXP)

Same capabilities and outcomes as the ISP minus the ability to block reliably.
Content is ciphertext under TLS to the relay and E2EE inside that. Local
UI↔bridge↔core traffic never leaves the loopback interface, so a network
observer sees none of it. Residual risk: same metadata as §4.2.

### 4.4 MITM on the invitation exchange

**Capability.** Controls the channel over which the invitation link travels
(e.g. the email/SMS/messenger used to send it) and can substitute or proxy it
in real time — the classic active MITM against key agreement.

**Can achieve (if unverified).** Sit between the two parties as a relay of
plaintext: each victim completes a handshake with the attacker instead of
each other. This is the strongest network attack in this model, and it is
inherent to *any* system that bootstraps trust from an insecure channel.

**Cannot achieve (if verified).** Survive out-of-band verification.
**Out-of-band contact verification reduces MITM risk**: comparing the SimpleX
security code over an independent channel (in person, a call, another
already-trusted channel) detects the interposition, because the attacker
cannot make both sides' codes match.

**Mitigations in FWA.** Invitation links transit out-of-band by design — FWA
never uploads them anywhere; the user chooses the channel. The UI surfaces
one-time invitations generated by the core (`/_connect`), which are single-use
by protocol. Verification via SimpleX security codes is the documented
procedure for high-risk contacts.

**Residual risk.** Users who never verify and who exchanged the link over a
channel the attacker controls are exposed. FWA cannot detect this on their
behalf.

### 4.5 Substituted invitation link

**Capability.** Replaces the invitation link at rest or in transit (edits the
email, compromises the paste site, swaps a QR code) rather than proxying live.

**Can achieve.** The victim connects to the attacker instead of the intended
contact. This is impersonation, not decryption — no existing conversation is
affected, and no key material leaks.

**Cannot achieve.** Read any existing conversation; make the security codes
match a live-proxied contact (see §4.4).

**Mitigations.** Same as §4.4: out-of-band delivery over a channel the user
trusts, plus security-code verification, plus ordinary human checks ("is this
person who they claim to be?"). One-time invitations limit the blast radius
to a single connection attempt.

**Residual risk.** A convincing impersonation accepted without verification.

---

## 5. Local adversaries

### 5.1 Local malware running as the same user

**Capability.** Arbitrary code as the logged-in user: read process lists,
connect to loopback ports, read/write the user's files, read process memory
(platform permitting), capture the screen, inject input.

**Can achieve — essentially everything:**

- **A compromised device CAN read content after decryption.** This is the
  honest core statement of this document: "Content is end-to-end encrypted.
  It can be read on participating devices after decryption." E2EE protects
  the path between devices, not a device that is itself hostile.
- Read the DB passphrase from the core's argument list via `ps`
  (**LIMITATION 1**) and then decrypt the SQLCipher database offline.
- Connect directly to the core's unauthenticated loopback WS port
  (**LIMITATION 2**) and issue any command: read history, send messages,
  exfiltrate contacts.
- Read the core's memory, capture the screen, keylog the passphrase.

**Cannot achieve.** Nothing relevant is out of reach; this adversary is
**explicitly inside the accepted threat boundary**. The bridge's
authentication exists to protect the *browser* surface from web content, not
to stop same-user native code — which could equally read process memory, so
adding auth to the core port would not change this adversary's outcome.

**Mitigations.** None that hold against this adversary; the mitigation is OS
hygiene (don't run malware). FWA reduces *incidental* exposure: logs cannot
contain content (fixed-vocabulary logger), core stdout is discarded, the DB
is never plaintext on disk, staging is wiped at shutdown.

**Residual risk.** Total, by definition. Any product claiming otherwise
about same-user malware is misrepresenting what software can do.

### 5.2 Malicious browser extension

**Capability.** Runs inside the browser with whatever permissions it was
granted; commonly full DOM access on all pages, sometimes cookie and network
access.

**Can achieve.** **A malicious browser extension CAN observe the DOM** — and
the DOM is where decrypted messages are rendered. An extension with host
access to `127.0.0.1` can read every message displayed, scrape contact names,
capture text as it is typed (including the DB passphrase in the unlock form),
and issue authenticated requests from the page context.

**Cannot achieve.** Read the session cookie value if limited to content-script
DOM access (HttpOnly) — though with `cookies` permission it can. Reach the
core process or files directly (that requires native code, §5.1).

**Mitigations.** The page CSP does not restrict extensions (browsers exempt
them by design), so FWA cannot defend here. The only real mitigations are
user-side: a browser profile without extensions for FWA, or a browser whose
extensions have no `127.0.0.1` host access.

**Residual risk.** High if untrusted extensions are installed. This is a
browser-platform boundary that no localhost web app can engineer around.

### 5.3 Stolen device

**Capability.** Physical possession. Four cases:

| Device state | Attacker has DB passphrase? | Outcome |
|---|---|---|
| Locked, disk encryption on (FileVault etc.) | No | Nothing readable: OS credentials gate everything; DB additionally SQLCipher-encrypted |
| Locked, disk encryption on | Yes | Still needs OS login first; passphrase alone opens nothing without the files |
| Unlocked (or OS password known) | No | Files readable but DB is ciphertext (fail-closed, verified: wrong/no key → `ErrorNotADatabase`); attacker can attempt offline guessing (§5.4). **If FWA is running at theft time**: the open session shows plaintext in the browser, and the passphrase is visible in `ps` (LIMITATION 1) — full compromise |
| Unlocked | Yes | Full compromise: open the profile, read everything, impersonate the user going forward |

**Mitigations.** SQLCipher DB created encrypted from first write (never a
plaintext window on disk); fail-closed open; random-bytes header does not even
advertise itself as SQLite. New bridge tokens/ports per launch mean no
long-lived web credential survives a reboot. FWA cannot enforce OS disk
encryption or screen locking — those are the user's job and they matter more
than anything FWA does.

**Residual risk.** A device stolen while unlocked and running is a
compromised device (§5.1). Forward secrecy in the SimpleX protocol limits
what a captured ratchet state reveals about *past* traffic keys, but the DB
itself stores readable history once decrypted.

### 5.4 Weak DB password

**Capability.** Attacker has the DB files (§5.5) and runs offline guessing
against SQLCipher.

**Can achieve.** Decrypt the full database — all history, contacts, keys — if
the passphrase falls to a dictionary/brute-force attack. Offline guessing is
not rate-limited by anything FWA controls.

**Mitigations.** The bridge enforces a minimum passphrase length of 12
characters at profile creation (`BRIDGE_LIMITS.minPasswordLength`, checked in
`/api/profile/create`). SQLCipher's KDF imposes per-guess cost. FWA never
stores or logs the passphrase; it exists transiently in the create/open
request body over loopback and then only in the core's argument list
(LIMITATION 1).

**Residual risk.** A length check is not an entropy check: `passwordpassword`
passes. The passphrase is the single knob the user controls for
data-at-rest security; a weak one voids §5.3's encrypted-at-rest guarantees.

### 5.5 Copied database files

**Capability.** Attacker obtains `*_chat.db` / `*_agent.db` (backup theft,
cloud-sync leak, disk image) without the passphrase.

**Can achieve.** Attempt offline decryption (§5.4). Learn approximate file
sizes and timestamps.

**Cannot achieve.** Read anything without the passphrase — verified
fail-closed, and the header is random bytes, so casual inspection does not
even identify the format.

**Mitigations.** DB is encrypted from the very first byte written (fresh DB +
`-k`); there is never a plaintext database on disk to copy. Attachments in
`files/` are, however, stored as received — **decrypted files on disk are not
covered by the DB passphrase**; they rely on OS disk encryption.

**Residual risk.** Weak passphrase (§5.4); plaintext attachments in `files/`
if full-disk encryption is off.

---

## 6. Web-origin adversaries

### 6.1 XSS in the web UI

**Capability.** Hypothetical: attacker-controlled script executing in the
app's origin — the worst web-side outcome, equivalent to §5.2 for content.

**Would achieve if it existed.** Read all displayed messages, issue
authenticated bridge requests (the cookie rides along automatically), send
messages via the WS proxy. It could *not* read the HttpOnly cookie value or
escape the browser.

**Why it is hard here (defense in depth):**

1. React's default escaping; the codebase avoids `dangerouslySetInnerHTML`.
2. CSP: `default-src 'none'; script-src 'self'; style-src 'self'` with only
   `style-src-attr 'unsafe-inline'` (dynamic style attributes; no `<style>`
   injection, no external sheets). No inline scripts, no `eval`, no remote
   code can execute even if markup injection were achieved.
3. No remote content at all: `img-src 'self' data: blob:`,
   `media-src 'self' blob:`, `connect-src` limited to self plus the explicit
   loopback WS — an injected payload has nowhere external to exfiltrate to.
4. `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`,
   `frame-ancestors 'none'` close the classic secondary channels.
5. Message content from the core is rendered as text, never as HTML.

**Residual risk.** A bug in React or the browser, or a future code change
that renders untrusted HTML. CSP confines exfiltration to the loopback origin
(the attacker's script could still *send* chat messages through the
legitimate WS to leak data to a contact the attacker controls — no CSP stops
in-protocol exfiltration).

### 6.2 CSRF

**Capability.** A page on another origin causes the victim's browser to send
requests to the bridge.

**Cannot achieve.** State change or data read. Four independent layers each
individually block it: (1) the session cookie is `SameSite=Strict`, so
cross-site requests carry no cookie; (2) `Origin` is required and must be a
loopback origin on every state-changing request and WS upgrade; (3) the
`Host` allowlist rejects anything not addressed to the exact bridge origin;
(4) the bridge port is random per launch, so the attacker does not know where
to aim. Responses are additionally unreadable cross-origin (no CORS headers,
`Cross-Origin-Resource-Policy: same-origin`).

**Residual risk.** Negligible under current browser behavior; the design does
not depend on any single one of the four layers.

### 6.3 DNS rebinding

**Capability.** Attacker serves a page from `attacker.example`, then rebinds
that hostname's DNS to `127.0.0.1`, hoping the page's same-origin requests
land on the bridge.

**Cannot achieve.** The rebound request arrives with
`Host: attacker.example`, and the bridge's strict Host allowlist
(`127.0.0.1:<port>`, `localhost:<port>`, `[::1]:<port>` — `guards.ts`,
checked on **every** request before any routing) rejects it with 403. WS
upgrades apply the same check plus Origin validation. The random per-launch
port adds a discovery barrier on top.

**Residual risk.** Effectively closed; the Host check is the standard and
sufficient countermeasure, and it is enforced unconditionally.

### 6.4 Malicious web page probing localhost

**Capability.** Any web page can attempt `fetch()`/WebSocket/`<img>` probes
against `127.0.0.1:*` ports from inside the victim's browser.

**Can achieve.** At most, coarse port-liveness inference through timing —
a browser-wide limitation affecting every local server.

**Cannot achieve.** Read any response (no CORS, CORP `same-origin`); execute
any authenticated action (no cookie cross-site — `SameSite=Strict`; Origin
required and validated on POST/WS); hit the core directly (the browser can
only reach it via raw WS, and the upgrade path exists only on the bridge,
which authenticates it — the core's own port is protected from *web* content
by the browser's socket model, though not from native code, LIMITATION 2);
guess the bridge port cheaply (random per launch, and even a hit fails the
cookie/Origin gates); steal the bootstrap code (it lives in the URL fragment
of a page only the launcher opens, is stripped from history immediately, is
single-use with a 5-minute TTL, and dies after 10 bad attempts).

**Residual risk.** Port-liveness inference. No data or capability exposure
identified.

---

## 7. Supply-chain adversaries

### 7.1 Compromised npm dependency

**Capability.** Malicious code inside a dependency executes with full
privileges in whichever process loads it — the bridge/launcher (Node) or the
UI bundle (browser).

**Can achieve if it ships.** In the bridge: everything §5.1 can (it *is*
same-user native code). In the UI bundle: everything §6.1's XSS can, but
without needing an injection bug — although the CSP still blocks external
exfiltration endpoints, since `connect-src` allows only self and the loopback
WS, and there are no CDN/analytics hosts to hide in.

**Mitigations.** The production dependency surface is deliberately tiny and
fully pinned to exact versions: `react`, `react-dom`, `react-router-dom`,
`zustand`, `qrcode`, `jsqr`, `ws`. `npm audit` is clean at build time
(0 vulnerabilities). The project rule forbids adding dependencies. No
network fetches at runtime (no CDN, no remote assets) means a compromised
package cannot be swapped in post-install. The app makes zero network
connections except to SimpleX relays, so a malicious dependency phoning home
would have to do so in violation of an otherwise-silent baseline —
observable to anyone watching the machine's traffic.

**Residual risk.** A poisoned version of a pinned package at install time, or
a compromise of npm itself. Pinning narrows the window to the moment of
`npm install`; it does not eliminate it.

### 7.2 Substituted SimpleX binary

**Capability.** Replaces the core binary at download time (network MITM,
compromised mirror) or on disk after install (the latter is §5.1).

**Can achieve.** Total compromise: the core holds all keys and plaintext.

**Mitigations.** The binary is downloaded from the official GitHub release
over TLS and its SHA-256 is pinned in the setup: Linux hashes
(`eaa3106…` for ubuntu-22.04, `0aec0a1…` for ubuntu-24.04) come from the
official signed `_sha256sums` asset; the macOS hash (`06eedfc…`) is
FWA-computed because **no official checksum is published for macOS/Windows
CLI assets (LIMITATION 3)** — trust-on-first-use at integration time, over
TLS from the official repo. Any later download that does not match the pinned
hash fails setup.

**Residual risk.** For macOS, the TOFU moment: if the very first download
that produced the pinned hash was already compromised, pinning perpetuates
the compromise. Cross-checking the hash against independent sources reduces
this. On-disk substitution post-install is §5.1.

### 7.3 Malicious attachment

**Capability.** A contact (or someone who compromised a contact) sends a file
crafted to exploit whatever opens it.

**Can achieve.** Nothing by mere receipt: incoming files are not auto-opened
or executed by FWA; they land in `files/` after explicit acceptance
(`/freceive`) and XFTP decryption by the core. Exploitation requires the
*user* to open the file in some other application, or a vulnerability in the
browser's image/media decoder when a preview is rendered.

**Cannot achieve via the bridge.** Path escape — uploads are staged under
random UUID names; `/api/file` serves only realpath-confined paths inside
`files/` and `staging/`, so an attachment cannot name itself into being read
from or written to an arbitrary location.

**Mitigations.** No auto-open; confinement as above; CSP means a crafted
HTML/SVG attachment rendered via `/api/file` cannot run script against the
app origin (`script-src 'self'` only, and blob/data images do not execute).
Filenames from the sender are treated as untrusted display strings.

**Residual risk.** Decoder vulnerabilities in the browser or in third-party
apps the user opens files with. Treat attachments from unverified contacts
with the same suspicion as email attachments.

---

## 8. Physical and OS-level leakage

### 8.1 Shoulder surfing / screenshots

**Someone with screen access CAN see messages.** The screen displays
plaintext — that is what a messenger is for. Screenshots, screen recording,
screen sharing, remote-desktop sessions and simple physical observation all
capture whatever is displayed, and no web application can prevent OS-level
screen capture. Mitigations are behavioral (lock the screen, mind who is
behind you, mind what is shared in meetings). Residual risk: complete for
whatever is on screen at the time.

### 8.2 Clipboard snooping

Invitation links are copied to the clipboard by explicit user action, and
users may copy message text. Any local process (and on some platforms, other
apps polling the clipboard) can read it; clipboard managers keep history. An
exposed invitation link is a §4.5 scenario — single-use and useless after the
legitimate contact connects, but live until then. Mitigation: FWA only writes
to the clipboard on explicit user action and never puts passwords there.
Residual risk: whatever the user copies, for as long as it stays there.

### 8.3 Crash dumps

If the core, the bridge, or the browser crashes, the OS may write a memory
dump containing decrypted messages, ratchet keys, or the DB passphrase.
FWA cannot control OS crash-dump policy. The bridge's own error handling
never writes payloads (fixed-vocabulary log codes only, `internal_error` with
no detail), and core stdout/stderr — which echoes commands including
`/db encrypt <key>` — is discarded at the OS level, so FWA's own artifacts
stay clean; the OS's artifacts are the user's platform configuration.
Mitigations: disable or restrict crash reporting for these processes; keep
full-disk encryption on so dumps at rest are covered. Residual risk: dumps on
an unencrypted disk, or dumps uploaded by OS crash-reporting telemetry.

### 8.4 OS swap

Memory pages holding plaintext or key material may be swapped to disk.
Neither Node, the browser, nor the Haskell-runtime core locks its pages.
With full-disk (or encrypted-swap) protection, swapped secrets are covered at
rest; without it, forensic recovery from the swap file is possible.
Mitigation: enable OS disk/swap encryption (default on modern macOS with
FileVault). Residual risk: unencrypted swap on misconfigured systems.

---

## 9. What FWA does not defend against — explicit non-goals

Stated plainly, without qualification:

1. **A compromised device can read content after decryption.** E2EE ends at
   the endpoint. If the endpoint is hostile, the content is exposed.
2. **A malicious browser extension can observe the DOM**, including every
   displayed message and the passphrase as it is typed.
3. **Someone with screen access can see messages.** No software prevents
   OS-level screen capture or a person looking at the display.
4. **Metadata visible to the network** (that you use SimpleX/Tor, when, how
   much) is reduced but not eliminated.
5. **An unverified contact may be a man in the middle.** Out-of-band
   verification via SimpleX security codes is the countermeasure and it
   requires user action.
6. **No application can promise absolute security.** FWA's claims are limited
   to the specific mechanisms and boundaries documented above; anything not
   listed as defended should be assumed undefended.

The user-facing statement of this posture is deliberately modest and appears
verbatim in the UI: *"Content is end-to-end encrypted. It can be read on
participating devices after decryption."*

---

## 10. Cross-reference

| Mechanism | Implementation |
|---|---|
| Perimeter guards (loopback socket, Host, Origin) | `packages/simplex-bridge/src/guards.ts` |
| Session bootstrap, cookie, rate limits, routing | `packages/simplex-bridge/src/bridge.ts`, `auth.ts` |
| WS frame validation and proxying | `packages/simplex-bridge/src/wsProxy.ts` |
| File confinement and staging | `packages/simplex-bridge/src/files.ts` |
| Fixed-vocabulary logging | `packages/simplex-bridge/src/log.ts` |
| Core behavior, verified commands, DB encryption facts | `docs/SIMPLEX_INTEGRATION.md` |
| Protocol contracts | `packages/shared-types/src/bridge.ts`, `simplex.ts` |

Limitations cited: LIMITATION 1 (`-k` passphrase visible in `ps`),
LIMITATION 2 (unauthenticated core WS port, loopback-only), LIMITATION 3
(no official macOS checksum; FWA pins its own TOFU hash). A fourth known
limitation (browser voice notes are webm/opus and may not play on official
SimpleX mobile apps) is a compatibility note with no security impact.

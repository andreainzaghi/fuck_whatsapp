# Known Limitations

This document lists every known limitation of FWA ("FUCK WHATSAPP") that we are
aware of, without marketing spin. Each entry states the impact, how likely it
is to matter in practice, and what mitigation exists (if any).

Framing that applies to everything below: content is end-to-end encrypted by
the unmodified official SimpleX Chat core (CLI v6.5.6). It can be read on
participating devices after decryption. FWA implements zero cryptography of
its own; nothing here claims — or should be read as claiming — absolute
security. A compromised local machine defeats any chat application, including
this one.

---

## 1. Database passphrase is visible in the local process list

**What.** The SimpleX CLI accepts the SQLCipher database passphrase **only**
via the `-k` command-line argument. While the core process runs, the
passphrase is visible to any same-user local process via `ps` / `/proc` /
Activity Monitor.

**What we tried (verified against v6.5.6).** This is not laziness on our part;
we exhausted the official surface:

- **stdin**: the CLI *does* read the display name from stdin on first run
  (which is why the display name is never in the process list), but it offers
  **no stdin prompt for the key**. Started against an encrypted DB without
  `-k`, the process simply exits with `SQLite3 returned ErrorNotADatabase` —
  no prompt, no retry.
- **environment variable / file descriptor**: no such option exists in v6.5.6.
- **`/_db encryption` over WebSocket**: works, but **only in maintenance mode**
  (`-m`); with the chat running it fails with `chatNotStopped`. So we cannot
  start unencrypted and encrypt "a moment later" without a plaintext window,
  and we refuse to ever have a plaintext database on disk.
- **`/_stop` then re-key**: `/_stop` does not pause the chat controller — it
  **terminates the whole CLI process** (`AsyncCancelled`). There is no
  stop → re-key → resume path inside one process.

**Impact.** A local observer running as your user (or root) can read the DB
passphrase while the app is running and later decrypt the database files.

**Likelihood context.** The observer must already be executing code on your
machine as your user. Such an attacker can also read the core's process memory
(which necessarily contains the key and decrypted messages), keylog you, or
read the browser tab directly. In other words: exploiting this requires a
position from which far stronger attacks are already possible. It is a real
weakness of the CLI interface, not an additional practical loss of security
relative to that attacker.

**Mitigation.**
- The database is *created* encrypted from the very first byte (`-k` on a
  fresh DB); a plaintext database never exists on disk. Verified fail-closed:
  with no key or a wrong key the core exits with `ErrorNotADatabase`, and the
  file header is random bytes, not `SQLite format 3`.
- Exposure is loopback/local-only and lasts only while the core runs.
- If a future CLI version adds a stdin/fd key option, FWA will adopt it.
- Do not run FWA on machines shared with untrusted users.

## 2. The core's own WebSocket port has no authentication

**What.** The SimpleX CLI's WebSocket server (random port, verified via `lsof`
to bind 127.0.0.1 only) accepts connections from **any** local process running
as any user on the machine; the CLI provides no authentication mechanism for
it. FWA's bridge adds a full auth layer (one-time bootstrap code → HttpOnly
cookie, Host/Origin checks, rate limits) — but that protects only the
**browser-facing** surface. A local process could bypass the bridge and talk
to the core directly.

**Impact.** Same-user local malware could send commands to the core: read
chats, send messages, create invitations.

**Likelihood context.** Same boundary as limitation 1: the attacker is already
executing code on your machine. Such a process could equally read the core's
memory or the `-k` argument. The bridge's auth exists to stop the *browser*
threat model (malicious web pages, DNS rebinding, cross-origin requests), which
it does; local same-user malware is explicitly inside the accepted threat
boundary.

**Mitigation.** The port is random per launch and loopback-only, so nothing is
reachable from the network. Keep your OS user account free of untrusted
software; there is no in-app fix possible without upstream CLI changes.

## 3. No official checksum for the macOS CLI binary (TOFU pinning)

**What.** SimpleX publishes a `_sha256sums` file for v6.5.6 that covers **only
Linux assets**:

```
eaa3106616a39acdca75b2312d56e41babb6ebca54204c943a992ec4b9461154  simplex-chat-ubuntu-22_04-x86_64
0aec0a1ebd35ec3dfbb9f969f5d58e4269c8eca236f5be096780b9465dda2dbe  simplex-chat-ubuntu-24_04-x86_64
```

For macOS there is no official hash. FWA pins the hash it computed itself when
the binary was first downloaded (trust-on-first-use, over TLS from the
official GitHub release):

```
06eedfcad8cbf31abb2c13892592a1a532c4043c4954be645dfe8a1447ee9066  simplex-chat-macos-aarch64
```

**Impact.** If GitHub's release asset had been tampered with at the moment FWA
computed its hash, the pin would faithfully verify the tampered binary. The
pin protects against *later* substitution, not against compromise at
integration time.

**Likelihood context.** The download happened over TLS from the official
`simplex-chat/simplex-chat` GitHub releases page. Tampering would require
compromising GitHub's asset storage or a TLS MITM with a trusted certificate —
both serious, low-probability events, but not impossible, which is why we
document this instead of pretending the hash is official.

**How to verify independently.**
1. Download `simplex-chat-macos-aarch64` yourself from
   `https://github.com/simplex-chat/simplex-chat/releases/tag/v6.5.6`,
   ideally from a different machine/network.
2. Run `shasum -a 256 simplex-chat-macos-aarch64` and compare with the pinned
   hash above and with the binary FWA installed.
3. For maximum assurance, build the CLI from the AGPL-3.0 source at the same
   tag and compare behavior (bit-identical reproducible builds are not
   guaranteed by upstream for macOS).
4. On Linux, this limitation does not apply: FWA uses the official
   `_sha256sums` values.

## 4. Voice notes may not play in official SimpleX mobile apps

**What.** Browser voice recording uses `MediaRecorder`, which produces
**webm/opus**. Official SimpleX mobile apps record and expect **m4a** and may
not play webm files.

**Impact.** A voice note sent from FWA to a contact on the official iOS or
Android SimpleX app may arrive as a file the recipient cannot play in-app
(they can still save it and play it in another player). FWA-to-FWA voice
playback works.

**Likelihood context.** Affects every voice note sent to official-app users.
This is an interoperability caveat, not a security issue — the audio is
end-to-end encrypted like any other file either way.

**Mitigation.** None in-browser without shipping an audio transcoder (rejected:
it would mean large new code surface for a cosmetic gain). Send text or files
if your contact is on an official mobile app and cannot play your voice notes.

## 5. Plaintext exists in browser memory and the DOM while displayed

**What.** To show you a message, FWA must decrypt it (done by the core) and
render it — so message text, images, and contact names exist as plaintext in
the browser tab's memory and DOM while displayed.

**Impact.** Anything that can read the browser process — a debugger, another
same-user process, a malicious browser extension with page access — can read
what is currently on screen.

**Likelihood context.** This is inherent to **every** chat application ever
built, native or web: a screen that shows you a message contains that message.
It is listed here because we promised honesty, not because FWA is unusual.

**Mitigation.** The tab talks only to 127.0.0.1; the CSP
(`default-src 'none'; script-src 'self'; …; frame-ancestors 'none'`) blocks
external script injection and framing; there is no localStorage/sessionStorage
or service worker, so nothing persists in the browser after the tab closes.
Audit your browser extensions — an extension with "read all sites" permission
can read any page, including this one.

## 6. Invitation links must travel out-of-band — that channel is on you

**What.** To connect with someone, one side generates an invitation link
(`simplex:/invitation#/...` or the short `https://smp*.simplex.im/i#...` form)
and it must reach the other person over some channel you choose — email,
another messenger, a QR code shown in person, etc.

**Impact.** Whoever sees the link before it is accepted could accept it
themselves (impersonation) or, in theory, attempt a MITM. After the connection
is established the link is useless.

**Likelihood context.** Depends entirely on the channel you use. A QR code
scanned in person is effectively unattackable; a link pasted into a corporate
chat is as confidential as that chat.

**Mitigation.**
- FWA uses **one-time** invitation links: the first accepted connection
  consumes the link, which limits the exposure window.
- Verify the connection out-of-band after connecting (compare SimpleX security
  codes with your contact over a channel you trust, e.g. in person or a voice
  call).
- Prefer showing the QR code in person when possible.

## 7. No multi-device sync; no groups in the UI (MVP)

**What.**
- Your profile lives in one encrypted database on one machine. There is no
  sync to a second device; using FWA on two machines means two unrelated
  identities.
- The SimpleX core fully supports groups, but the FWA UI is 1:1 direct
  messages only in this MVP.

**Impact.** Functional limitation only: no phone+laptop mirroring, no group
chats through this UI.

**Likelihood context.** You will hit this on day one if you expect
WhatsApp-style multi-device behavior.

**Mitigation.** None for sync in the MVP (this is also partly a privacy
feature: no cloud copy of your database exists anywhere). Groups may be added
later — the underlying protocol support is already present in the core.

## 8. Voice recording needs mic permission; QR scanning needs camera permission

**What.** The browser will prompt for microphone access the first time you
record a voice note and for camera access the first time you scan a QR
invitation.

**Impact.** Standard browser permission prompts; some users find them
alarming.

**Likelihood context.** Only triggered by using those two features; the rest of
the app works without any permissions.

**Mitigation.** Both are processed entirely locally: audio is recorded in the
tab and handed to the core for end-to-end encrypted sending; QR frames are
decoded in the tab (jsQR) and never leave your machine. The Permissions-Policy
header restricts camera/microphone to the app's own origin. Deny the prompts
and simply type/paste instead — nothing else breaks.

## 9. Loopback HTTP is unencrypted

**What.** The browser talks to the local bridge over plain `http://127.0.0.1`
(and `ws://` for the WebSocket). There is no TLS on this hop.

**Impact.** The traffic on this hop includes your session activity and message
plaintext being handed to/from the core.

**Likelihood context.** Loopback traffic never leaves the machine — it is not
on any wire, Wi-Fi, or LAN. To observe it, a process must capture the loopback
interface locally, which on macOS/Linux requires root — an attacker with root
owns the machine outright. Self-signed local TLS would add certificate-warning
friction while defending against no realistic additional attacker.

**Mitigation.** The bridge and core bind 127.0.0.1 explicitly (verified — no
0.0.0.0 anywhere); strict Host allowlisting defeats DNS rebinding; sessions
use an HttpOnly SameSite=Strict cookie that JS can never read. **Treat
multi-user machines as hostile**: on a shared host, root and (per limitations
1–2) same-user processes are inside the boundary.

## 10. Changing the database passphrase requires a core restart

**What.** `/_db encryption` (the re-key command) only works in maintenance
mode, and `/_stop` terminates the CLI process rather than pausing it. So a
passphrase change means: shut the core down, restart it in maintenance mode,
re-key, restart chat.

**Impact.** Brief downtime during a passphrase change; not a data-loss or
confidentiality issue.

**Likelihood context.** Only when you change your passphrase, which is rare.

**Mitigation.** None needed beyond patience; the restart takes seconds. This is
an upstream CLI design constraint, verified against v6.5.6.

## 11. Swap files and crash dumps can contain plaintext

**What.** The operating system may page process memory (core, bridge, browser)
to disk (swap) or write it into crash dumps. That memory can contain decrypted
messages, keys, and the DB passphrase.

**Impact.** Someone with offline access to your disk could recover message
fragments from swap or dump files even though the database itself is
SQLCipher-encrypted.

**Likelihood context.** OS-level and universal: this applies to **every** chat
application on every platform, including the official SimpleX apps, Signal,
and everything else. It requires an attacker with access to your disk
contents.

**Mitigation.** Enable full-disk encryption — FileVault on macOS, LUKS on
Linux — which encrypts swap and dumps along with everything else. On macOS,
FileVault is on by default on modern installs; verify in System Settings.
Consider disabling crash reporting uploads at the OS level if this concerns
you.

---

## What is *not* on this list

For balance, limitations frequently assumed of web-based messengers that do
**not** apply here:

- **No server can read your messages.** SimpleX relays see ciphertext, queue
  IDs, timing, and sizes — never content. FWA adds no backend of its own:
  traffic goes only to the SimpleX relays configured in the core (default
  preset operators SimpleX Chat Ltd and Flux, user-replaceable, with onion
  hostnames available and SOCKS/Tor supported via `FWA_SOCKS_PROXY`).
- **No third-party requests.** No CDN, fonts, analytics, error trackers,
  Google/Meta/AWS/Firebase — the app is fully self-contained and the CSP
  enforces it.
- **No plaintext database, ever.** The DB is created encrypted from the first
  write; there is no "encrypt later" window.
- **No secrets readable by page JavaScript.** The session token is an HttpOnly
  cookie; the one-time bootstrap code is single-use with a 5-minute TTL and a
  10-attempt cap; no localStorage/sessionStorage is used at all.
- **No log leakage.** Bridge logs use a fixed vocabulary of event codes — free
  text is structurally impossible — and the core's stdout/stderr are discarded
  at the OS level because the CLI echoes received commands (a verified leak
  channel we closed).

---

## Release & distribution limitations

These limitations concern how FWA is **packaged and shipped**, not its runtime
security posture. See [`SECURITY.md`](../SECURITY.md),
[`docs/SUPPLY_CHAIN_SECURITY.md`](SUPPLY_CHAIN_SECURITY.md), and
[`docs/LICENSE_COMPLIANCE.md`](LICENSE_COMPLIANCE.md) for the related security
and license details.

### R1. Builds are unsigned (macOS / Windows)

**What.** The macOS and Windows packages are **unsigned test builds** — no
Apple Developer ID / notarization and no Windows Authenticode signing. No code
signing is configured (no signing secrets are available).

**Impact.** The operating system will warn on first launch:

- **macOS Gatekeeper:** "'Fuck WhatsApp' cannot be opened because it is from an
  unidentified developer" (or a damaged/quarantine warning). To open it
  anyway: right-click (or Control-click) the app in Finder → **Open** →
  confirm **Open** in the dialog; or approve it under **System Settings →
  Privacy & Security → Open Anyway**.
- **Windows SmartScreen:** "Windows protected your PC". To open it anyway:
  click **More info** → **Run anyway**.

Only do this if you obtained the package from the official GitHub release and
verified its checksum (see R-checksums / `SHA256SUMS.txt` and the per-artifact
`.sha256`). Signing is planned but not yet in place.

### R2. Only macOS arm64 is locally verified

**What.** The **macOS arm64** package is the only one that has been built and
smoke-tested locally (build + packaged-app onboarding smoke test PASS). The
**Windows x64, Linux x64, Linux arm64, and macOS x64** packages are
**PREPARED IN CI — NOT LOCALLY VERIFIED.**

**Impact.** Non-arm64-macOS packages may have platform-specific issues that a
local run would have caught. Treat them as less battle-tested until verified on
real hardware.

**Mitigation.** CI builds them through the same pinned pipeline, and where
runnable the packaged-app smoke test exercises local onboarding. Community
verification on real hardware is welcome.

### R3. The package embeds a full Node runtime (~80 MB)

**What.** FWA is packaged as a Node **Single Executable Application (SEA)**, so
the Node runtime is embedded in the executable and the user installs nothing
(no Node, Docker, or SimpleX to install separately).

**Impact.** The download/footprint is larger than a script would be — on the
order of **~80 MB** for the packaged app (before the bundled SimpleX core,
which is itself tens to ~170 MB depending on platform). This is the cost of
zero-install.

### R4. macOS packages bundle OpenSSL dylibs from the build machine's Homebrew

**What.** The macOS SimpleX binary dynamically needs `openssl@3.0`. The macOS
package **bundles** `libcrypto.3.dylib` and `libssl.3.dylib` taken from the
**build machine's Homebrew `openssl@3.0`**, and the launcher sets
`DYLD_LIBRARY_PATH` at spawn (the SimpleX binary stays pristine; its SHA-256 is
intact).

**Impact.** The bundled OpenSSL version **tracks whatever Homebrew
`openssl@3.0` was installed on the build machine** at package time, rather than
a separately pinned OpenSSL release. A different build machine can therefore
ship a slightly different OpenSSL 3.0.x point release.

**Mitigation.** OpenSSL 3.0.x within the same series is API/ABI-compatible for
this use; it is attributed (Apache-2.0) in
[`docs/LICENSE_COMPLIANCE.md`](LICENSE_COMPLIANCE.md). Pinning a specific
OpenSSL build is a future improvement.

### R5. Linux builds target Ubuntu 24.04 glibc — may not run on very old distros

**What.** The Linux packages use the official SimpleX **Ubuntu 24.04** builds
and are produced on a modern glibc toolchain.

**Impact.** On **very old Linux distributions** (older glibc than Ubuntu
24.04's) the SimpleX core or the SEA may fail to load with glibc-version
errors.

**Mitigation.** Use a reasonably current distribution. Older-distro / musl
support is not provided in the MVP.

### R6. No auto-update

**What.** FWA has **no auto-update mechanism** yet. There is no background
updater and no in-app "update available" flow.

**Impact.** Users must manually re-download a newer release to update,
including for security fixes.

**Mitigation.** Watch the GitHub releases page and update manually. Auto-update
is a future consideration (and would itself need careful supply-chain design).

### R7. No installer / DMG in the MVP — portable archives only

**What.** The MVP ships **portable archives only**: `.zip` on macOS/Windows and
`.tar.gz` on Linux. There is **no DMG, no `.pkg`, and no Windows installer**.

**Impact.** No integrated install/uninstall experience; you unzip/untar and run
the app in place, and remove it by deleting the folder/app (the encrypted
database lives in the OS app-data directory and is not removed by deleting the
app).

**Mitigation.** Each archive includes a `README-FIRST.txt` with launch steps.
Installers are a possible future addition.

### R8. Reproducible-build gaps

**What.** The build is **not yet fully reproducible.** Contributing factors
include the embedded host Node runtime in the SEA, the macOS ad-hoc signature,
and the Homebrew-sourced OpenSSL dylibs (R4), among others.

**Impact.** Two independent builders may not produce byte-identical artifacts,
which limits third-party build verification.

**Mitigation.** The inputs that matter most for trust — the SimpleX core and
the release artifacts — are **SHA-256-pinned and checksummed** (see
[`docs/SUPPLY_CHAIN_SECURITY.md`](SUPPLY_CHAIN_SECURITY.md)). Progress toward
reproducibility and the remaining gaps are tracked in
[`docs/REPRODUCIBLE_BUILDS.md`](REPRODUCIBLE_BUILDS.md).

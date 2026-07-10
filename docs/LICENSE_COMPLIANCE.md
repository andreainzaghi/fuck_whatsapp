# License Compliance (AGPL-3.0)

This document explains, precisely and honestly, why FWA ("FUCK WHATSAPP") is
distributed under **AGPL-3.0**, how it complies with the AGPL's obligations for
the SimpleX Chat core it drives, and how a recipient obtains corresponding
source. It complements [`LICENSE`](../LICENSE),
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md), and
[`docs/LICENSES.md`](LICENSES.md).

> **Non-affiliation.** FWA is an unofficial, independent project. It is **not
> affiliated with, endorsed by, or connected to WhatsApp, Meta, or SimpleX Chat
> Ltd.** FWA is **not** an official SimpleX product.

---

## 1. What is distributed, and why the whole work is AGPL-3.0

A distributed FWA package contains two kinds of software:

1. **The official, UNMODIFIED SimpleX Chat CLI binary** — licensed
   **AGPL-3.0**. This is the cryptographic core; FWA drives it as a
   subprocess.
2. **Original FWA code** — the launcher, the local bridge, and the frontend
   (React/Vite) — written for this project.

FWA both **distributes** the AGPL-licensed SimpleX binary inside its release
packages **and** combines with it at runtime (the launcher spawns the CLI and
the bridge talks to it over a local WebSocket) to form a single functioning
program that FWA ships to users. Because an AGPL-3.0 component is distributed as
part of the combined work, **the whole distributed work is offered under
AGPL-3.0-only.** The FWA-original code is therefore licensed AGPL-3.0-only as
well (see [`LICENSE`](../LICENSE)).

This is a deliberate choice: it keeps the entire user-facing distribution free
and source-available, consistent with the SimpleX core's license.

---

## 2. The SimpleX Chat core — attribution and exact version

| | |
|---|---|
| Component | **SimpleX Chat CLI** |
| Version | **v6.5.6** (binary reports `6.5.6.1`), per [`vendor/simplex/simplex-manifest.json`](../vendor/simplex/simplex-manifest.json) |
| Copyright | **SimpleX Chat Ltd** and the SimpleX Chat contributors |
| Upstream source | <https://github.com/simplex-chat/simplex-chat> |
| Release tag | `v6.5.6` — <https://github.com/simplex-chat/simplex-chat/releases/tag/v6.5.6> |
| License | **AGPL-3.0** |

### How the binary is obtained (not vendored in git)

The SimpleX binary is **not committed to this repository.** It is **downloaded
unmodified from the official GitHub release** at build/setup time
(`scripts/download-simplex.mjs`), and its **SHA-256 is pinned** in the manifest
and **verified before use** (`scripts/verify-simplex.mjs`). The pinned hashes
and their provenance are published in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) and
[`docs/SUPPLY_CHAIN_SECURITY.md`](SUPPLY_CHAIN_SECURITY.md).

### Modifications

- **SimpleX Chat core: NONE.** FWA ships the official binary **bit-for-bit
  unmodified** (which is exactly what the pinned SHA-256 guarantees). FWA does
  not patch, recompile, or alter the core in any way.
- **FWA-original code:** the launcher, bridge, and frontend are original work
  by the FWA project (not derived from SimpleX source), and are themselves
  distributed under AGPL-3.0 as part of the combined work.

---

## 3. How a recipient obtains the corresponding source

The AGPL-3.0 requires that recipients of the distributed binary can obtain the
complete corresponding source of the whole work.

- **FWA-original source (launcher / bridge / frontend, build scripts, this
  documentation):** the complete source is this repository —
  <https://github.com/andreainzaghi/fuck_whatsapp>. Each release corresponds to
  a tagged commit; the packaged build is produced entirely from it by the
  pipeline documented in [`docs/SUPPLY_CHAIN_SECURITY.md`](SUPPLY_CHAIN_SECURITY.md).
- **SimpleX Chat core source:** the corresponding source for the exact binary
  shipped is the upstream tag **`v6.5.6`**:
  <https://github.com/simplex-chat/simplex-chat/tree/v6.5.6> (release page:
  <https://github.com/simplex-chat/simplex-chat/releases/tag/v6.5.6>). Because
  FWA ships the official unmodified binary, the corresponding source is
  upstream's published source for that tag; FWA has no core modifications to
  publish.

Together, this repository (for FWA code + how the core is fetched and pinned)
plus the pinned upstream tag (for the core) constitute the complete
corresponding source of the distributed work.

---

## 4. AGPL §13 — network-use / remote-interaction note

AGPL-3.0 §13 requires that users who **interact with the software remotely over
a network** be offered the corresponding source.

FWA is designed to run **entirely locally**: the launcher, bridge, and frontend
bind `127.0.0.1` (loopback) only, the UI opens in the local user's own browser,
and there is **no remote FWA backend and no remote users** interacting with a
network-facing instance. In the normal FWA deployment there are therefore no
"remote network users" for §13 to serve.

Regardless, FWA keeps its complete source publicly available at the repository
above, which satisfies §13 for anyone who did make the software accessible over
a network. **If you modify FWA and expose it to remote users over a network,
§13 obliges you to offer those users the corresponding source of your modified
version.**

---

## 5. Bundled OpenSSL on macOS (Apache-2.0)

On macOS the SimpleX CLI dynamically links **OpenSSL 3.0**. The macOS FWA
package **bundles** the required shared libraries — `libcrypto.3.dylib` and
`libssl.3.dylib` (from Homebrew `openssl@3.0`) — into
`Contents/Resources/lib/`, and the launcher sets `DYLD_LIBRARY_PATH` at spawn
time so the core loads them. The SimpleX binary itself is left pristine (its
SHA-256 stays intact).

- **Component:** OpenSSL 3.x
- **Copyright:** The OpenSSL Project and contributors
- **License:** **Apache License 2.0**
- **Upstream:** <https://www.openssl.org/> / <https://github.com/openssl/openssl>

OpenSSL's Apache-2.0 license is compatible with distribution alongside the
AGPL-3.0 work. The bundled dylib version tracks the build machine's Homebrew
`openssl@3.0` at package time (see
[`docs/KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md)). This bundling applies to
the macOS packages only; the Windows and Linux SimpleX assets do not require
it.

---

## 6. Other dependency licenses

All third-party components FWA uses, with exact pinned versions and license
identifiers, are enumerated in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) and summarized in
[`docs/LICENSES.md`](LICENSES.md). Full license texts ship inside each
package's directory. The packaged distributions also include a
`THIRD_PARTY_NOTICES.txt`.

---

## 7. Trademark / branding note

The **SimpleX name and logo are NOT used as FWA branding**, and the SimpleX
logo is not used as the FWA app logo. Likewise the WhatsApp and Meta names and
logos are not used as FWA branding. Attribution to SimpleX Chat Ltd in this
repository and in the app is **factual attribution** of the AGPL-3.0 software
FWA depends on — it does **not** imply endorsement, affiliation, or that FWA is
an official SimpleX (or WhatsApp/Meta) product. FWA is an independent project.

---

## 8. Summary

- FWA distributes the **unmodified** official **SimpleX Chat CLI v6.5.6**
  (AGPL-3.0) together with **original** FWA launcher/bridge/frontend code.
- The combined distributed work is offered under **AGPL-3.0-only**.
- The core binary is downloaded unmodified from the official release and
  SHA-256-pinned; **no modifications** are made to SimpleX.
- Corresponding source: this repository (FWA code) + upstream tag `v6.5.6`
  (core).
- macOS packages additionally bundle **OpenSSL 3.0** (Apache-2.0), attributed
  above.
- FWA is **not** affiliated with, or an official product of, WhatsApp, Meta, or
  SimpleX Chat Ltd.

# Licensing

> This document is a plain-language summary for contributors and redistributors.
> It is not legal advice. The legally binding text is the [`LICENSE`](../LICENSE)
> file at the repository root.

## FWA license: AGPL-3.0-only

All FWA code in this repository — the React web UI (`apps/web`, `packages/ui`),
the Node launcher and bridge (`apps/launcher`, `packages/simplex-bridge`), the
shared protocol types (`packages/shared-types`), and the setup/verification
scripts (`scripts/`) — is licensed under the
**GNU Affero General Public License, version 3 only (AGPL-3.0-only)**.

The full license text is in the root [`LICENSE`](../LICENSE) file. Every
workspace `package.json` declares `"license": "AGPL-3.0-only"`.

## Why AGPL

FWA is a local frontend for the **SimpleX Chat CLI**, which is licensed under
**AGPL-3.0**. FWA downloads the official, unmodified CLI binary at setup time,
spawns it as a child process, and drives it over its local WebSocket API. All
end-to-end encryption (double ratchet, key exchange, message queues, XFTP file
encryption, forward secrecy, post-compromise security) lives in that unmodified
core; FWA implements zero cryptography of its own.

Whether a launcher that spawns and drives a separate AGPL binary constitutes a
combined work is a legal gray area we do not need to enter: **FWA adopts
AGPL-3.0-only for its own code**, so the distributed whole — FWA code plus the
core it obtains — is uniformly available under compatible AGPL terms and the
obligations stay clean, whichever interpretation applies.

## Your obligations if you redistribute or modify FWA

Summarized; §-references are to AGPL-3.0. The license text controls.

- **Provide Corresponding Source.** If you convey FWA (modified or not), you
  must make the complete corresponding source available under AGPL-3.0 (§6).
- **Network use is conveying (§13).** If you run a modified version of FWA and
  let other users interact with it remotely through a computer network, you
  must offer those users the Corresponding Source of your modified version,
  free of charge. This is the clause that distinguishes AGPL from GPL. (Note:
  stock FWA binds to 127.0.0.1 only and is not designed to be served to remote
  users — but if you modify it to do so, §13 applies to you.)
- **Same license.** Modified versions and derivative works must be licensed as
  a whole under AGPL-3.0 (§5).
- **State changes.** Modified files must carry prominent notices stating that
  you changed them, and the date (§5a).
- **Keep notices.** Preserve copyright notices, license references, and
  warranty disclaimers (§4); keep this file and `THIRD_PARTY_NOTICES.md`
  accurate for what you actually ship.
- **No additional restrictions.** You may not impose further restrictions on
  the rights granted by the license (§10), including via patent claims (§11)
  or technical measures (§3).
- **No warranty.** The software is provided as-is (§15, §16).

## SimpleX attribution

| | |
|---|---|
| Component | SimpleX Chat CLI, version **v6.5.6** (binary reports `6.5.6.1`) |
| Copyright | **SimpleX Chat Ltd** and the SimpleX Chat contributors |
| Source | <https://github.com/simplex-chat/simplex-chat> |
| License | **AGPL-3.0** |
| How obtained | Downloaded **unmodified** from the official GitHub release at setup time (`npm run setup` → `scripts/install-simplex.mjs`), with a SHA-256 pinned per platform. It is **not vendored in this repository** — no SimpleX source or binaries are committed here. |

Checksum provenance: the Linux x86-64 checksums are taken from the official
signed `_sha256sums` release asset; for macOS (aarch64) the official checksum
file does not cover that asset, so FWA pins the hash it computed at integration
time over TLS from the official repository (documented in
`docs/KNOWN_LIMITATIONS.md`). The install script aborts on any mismatch.

FWA sends no traffic to any FWA-operated or proprietary backend. Network
traffic goes only to the SimpleX relays configured in the core (default preset
operators: SimpleX Chat Ltd and Flux; user-replaceable).

## Trademarks and naming

- The **SimpleX** name and logo are **not** used as FWA branding. FWA's UI is an
  original design; SimpleX is credited factually (as above and in the in-app
  "End-to-end encrypted by SimpleX Core" attribution), nothing more. No
  affiliation with or endorsement by SimpleX Chat Ltd exists or is implied.
- **WhatsApp** is a trademark of **Meta Platforms, Inc.** FWA does not use
  WhatsApp's name, logo, trade dress, or assets, and has no affiliation with
  WhatsApp or Meta. The application name ("FUCK WHATSAPP") is **provisional**,
  used as an expressive working title, and does not claim any connection to the
  WhatsApp product.
- FWA does not imitate the visual identity of either product.

## Third-party dependencies

Every npm dependency (runtime and development), with its exact pinned version
and verified license, is listed in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) at the repository root.

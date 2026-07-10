# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - unreleased

First public MVP of **FUCK WHATSAPP** — an unofficial, independent, open-source
local private chat app powered by the official, unmodified SimpleX Chat core.
FWA implements no cryptography of its own and runs no remote backend of its own.

### Added

- **SimpleX-backed local chat.** React web UI + a local Node launcher/bridge
  wrapping the official SimpleX Chat CLI (v6.5.6, AGPL-3.0), downloaded from the
  official GitHub release and verified against a pinned SHA-256 before use. All
  end-to-end encryption lives in the SimpleX core.
- **Redesigned UI.** New chat, conversation, connect/contact, network, settings,
  and onboarding screens, with light and dark themes and responsive layouts.
- **One-click packaging.** Node **Single Executable Application (SEA)** packaging
  that embeds the Node runtime so users install nothing (no Node, Docker, or
  separate SimpleX). The **macOS arm64** package is built and smoke-tested
  locally; Windows x64, Linux x64/arm64, and macOS x64 packages are **prepared
  in CI (not locally verified)**.
- **Hardened loopback bridge.** Binds `127.0.0.1` only; HttpOnly, SameSite=Strict
  session cookie exchanged from a one-time bootstrap token in the URL fragment
  (stripped immediately); `Origin`/`Host` checks; rate limiting; strict CSP; no
  `localStorage`; no remote assets/fonts/CDN/analytics; sanitized
  fixed-vocabulary logs (no message content, tokens, or filenames).
- **Born-encrypted database.** SQLCipher database created encrypted from the
  first write, fail-closed without the passphrase.
- **Documentation.** README, CONTRIBUTING, CODE_OF_CONDUCT, ROADMAP, PRIVACY,
  and detailed docs under `docs/` (security architecture, threat model, known
  limitations, SimpleX integration, licenses).
- **CI.** Build, unit tests, security checks, and a tag-triggered release
  workflow that produces a draft release for maintainer review before
  publishing.

### Known limitations

- All builds are **unsigned test builds** (no code signing / notarization).
- Only the **macOS arm64** package is verified on local hardware.
- The SimpleX CLI accepts the database passphrase only via a command-line
  argument (`-k`), so it is visible in the local process list while running.
  See [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md).

[0.1.0]: https://github.com/andreainzaghi/fuck_whatsapp/releases/tag/v0.1.0

# Roadmap

This roadmap is honest and near-term. It reflects intentions, not promises, and
nothing here should be read as a security or availability guarantee. Priorities
may change.

Legend: **[done]** shipped · **[planned]** intended, not started or in progress.

## Shipped in 0.1.0

- **[done]** SimpleX-backed local chat: React UI + local Node launcher/bridge
  around the official, unmodified SimpleX Chat CLI (v6.5.6), SHA-256 pinned.
- **[done]** Redesigned UI with light/dark themes and responsive layouts.
- **[done]** Node **SEA** packaging (no Node/Docker/SimpleX for the user).
- **[done]** macOS **arm64** package built and smoke-tested on local hardware.
- **[done]** Other platform packages (Windows x64, Linux x64/arm64, macOS x64)
  **prepared in CI** — not yet verified on real hardware.
- **[done]** Hardened loopback bridge (auth, CSP, rate limit, no plaintext logs).
- **[done]** Born-encrypted, fail-closed SQLCipher database.
- **[done]** Community/product docs and tag-triggered draft-release CI.

## Near-term

### Signing and distribution
- **[planned]** Code-sign and **notarize** the macOS builds.
- **[planned]** Code-sign the **Windows** builds (address SmartScreen warnings).
- **[planned]** Verify the **Windows x64** and **Linux x64/arm64** packages on
  real hardware (currently CI-prepared only).
- **[planned]** Native installers: a macOS **DMG** and a Windows installer.

### Updates
- **[planned]** Auto-update with **signature verification** of downloaded
  updates before they are applied.

### Features
- **[planned]** Groups UI.
- **[planned]** Video thumbnails for shared media.

### Build integrity
- **[planned]** Reproducible-build hardening so third parties can independently
  reproduce release artifacts from source.

## Future / exploratory
- **[planned]** Optional **Tauri** shell as an alternative to the browser-based
  launcher (exploratory; not committed).

## Explicitly out of scope
- FWA will not add its own cryptography or its own remote backend.
- FWA will not add telemetry, analytics, accounts, or phone/email requirements.

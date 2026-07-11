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
- **[done]** Linux **x64/arm64** packages **built in CI** — not yet verified on
  real hardware.
- **[deferred]** **macOS x64 (Intel)** package — pulled from v0.1.0. The package
  builds, but GitHub's hosted `macos-13` (Intel) runners queue for 45+ min and
  blocked the release. Re-add the `macos-13` leg in
  `.github/workflows/build-release.yml` and flip `darwin-x64.supported` in
  `vendor/simplex/simplex-manifest.json` once Intel runner availability is sane.
- **[deferred]** **Windows x64** package — pulled from v0.1.0. The Node **SEA**
  build/packaging and the Windows SimpleX runtime need verification on a real
  Windows host before we ship a build we can stand behind. Re-add the
  `windows-latest` leg in `.github/workflows/build-release.yml` and flip
  `windows-x64.supported` in `vendor/simplex/simplex-manifest.json` once verified.
- **[done]** Hardened loopback bridge (auth, CSP, rate limit, no plaintext logs).
- **[done]** Born-encrypted, fail-closed SQLCipher database.
- **[done]** Community/product docs and tag-triggered draft-release CI.

## Near-term

### Signing and distribution
- **[planned]** Code-sign and **notarize** the macOS builds.
- **[planned]** Code-sign the **Windows** builds (address SmartScreen warnings).
- **[planned]** Ship and verify the **Windows x64** package on a real Windows
  host (deferred from v0.1.0), and verify the **Linux x64/arm64** packages on
  real hardware (currently CI-built only).
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

# Release Audit

Initial release-engineering audit for **FUCK WHATSAPP** (repo `fuck-whatsapp`,
package `fwa-chat`), version `0.1.0`.

> Fuck WhatsApp is an UNOFFICIAL, independent, open-source local chat app. It is
> NOT affiliated with, endorsed by, or connected to WhatsApp, Meta, or SimpleX
> Chat. Messaging is powered by the official open-source **SimpleX Chat** core
> and network (AGPL-3.0). Fuck WhatsApp implements ZERO cryptography of its own
> and runs NO remote backend.

This document records the state of the project at the point release packaging
was introduced: what already existed, what was added to ship it, and the
decisions taken along the way. It is a factual audit — not a security guarantee.

---

## 1. What already existed (working dev app)

The following was implemented and working locally before release engineering
started:

| Area | State |
| --- | --- |
| **React frontend** | Vite app under `apps/web`, redesigned UI, hash-routing SPA, no remote assets/fonts/CDN/analytics. |
| **Node launcher + bridge** | `apps/launcher` (single local process) + `packages/simplex-bridge` (authenticated loopback HTTP + WS bridge). |
| **SimpleX integration** | Official SimpleX Chat CLI **v6.5.6** spawned on a random `127.0.0.1` port; the bridge never decrypts, stores, or logs message content. |
| **Bridge-auth test suite** | **19/19 passing** (HttpOnly `SameSite=Strict` cookie from a one-time bootstrap token, Origin/Host checks, CSP, rate-limit, loopback-only). |
| **End-to-end test** | Real two-profile E2E (`tests/e2e/two-user.mjs`) exercising the actual core. |
| **Security docs** | `docs/SECURITY_ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/LOCALHOST_SECURITY.md`, `docs/KNOWN_LIMITATIONS.md`, etc. |

The dev entry point (`npm run dev` / `npm start` → `scripts/start-local.mjs`)
already opened the app in the user's browser at `http://127.0.0.1:<random-port>`.

---

## 2. What was added for release

To turn the working dev app into a one-click, install-nothing distribution:

- **Node Single Executable Application (SEA) packaging.** The launcher + bridge
  + built frontend are bundled with esbuild (`scripts/bundle-launcher.mjs` →
  `build/launcher.cjs`) and injected into the host platform's own Node runtime
  (`scripts/build-sea.mjs` → `build/fuck-whatsapp[.exe]`). The end user installs
  nothing: no Node, no Docker, no SimpleX.
- **Multi-platform SimpleX manifest.** `vendor/simplex/simplex-manifest.json`
  pins SimpleX **6.5.6** with official GitHub release URLs, per-platform asset
  names, sizes, SHA-256, and honest provenance labels (`official-signed-sha256sums`
  for linux-x64; `tofu-computed` for the rest).
- **Download / verify / update scripts.**
  - `scripts/download-simplex.mjs` — downloads the pinned core for the host
    platform and verifies its SHA-256 **before** first use.
  - `scripts/verify-simplex.mjs` — re-verifies SHA-256 vs manifest + install
    record and runs `--version`.
  - `scripts/update-simplex-manifest.mjs` — never runs automatically; requires
    `--confirm` to change the pin.
- **Packaging assembler.** `scripts/package-app.mjs` assembles the per-OS
  package, produces the archive, and emits `SHA256SUMS.txt` + a per-artifact
  `.sha256`.
- **Packaged smoke test.** `tests/e2e/smoke-package.mjs` launches the packaged
  app and drives onboarding in Chromium, asserting the packaged core creates an
  encrypted profile locally (no network/relay needed).
- **Release/build docs** (this set): `RELEASE_AUDIT.md`,
  `DISTRIBUTION_ARCHITECTURE.md`, `REPRODUCIBLE_BUILDS.md`, `CODE_SIGNING.md`,
  `RELEASE_CHECKLIST.md`.

---

## 3. Package manager & lockfile

- **npm** with workspaces (`apps/*`, `packages/*`).
- Committed **`package-lock.json`** (npm lockfile). CI installs with `npm ci`,
  which installs exactly the locked tree.
- Build/release dev dependencies are pinned to exact versions (no `^`, no
  `latest`): `esbuild 0.28.1`, `postject 1.0.0-alpha.6`, `playwright 1.61.1`.
- Node is pinned via `.nvmrc = 22` (LTS). `engines.node` is `>=20.0.0` because
  Node SEA works on Node ≥ 20; the reference build uses Node 22.

---

## 4. Git state

- Real git repository on branch `main`, tracking `origin/main`.
- Target remote: `https://github.com/andreainzaghi/fuck_whatsapp` (owner
  `andreainzaghi`).
- Release-engineering changes staged as part of the same tree (launcher,
  scripts, manifest, packaging assets, docs).
- Ignored/never committed: build outputs (`build/`, `dist-pkg/`), downloaded
  runtime binaries (`runtime/bin/…`), `node_modules/`, and any local profile /
  encrypted database (see `.gitignore`).

---

## 5. Secret scan result

**None found.** Verified by inspection and by the repository's own guards:

- `scripts/security-check.mjs` and `tests/security/canary-scan.mjs`
  (`npm run test:security`) scan for secrets/canaries.
- No API keys, signing certificates, notary credentials, tokens, `.p12`/`.pem`
  key material, or personal data are committed. There are no signing secrets in
  the repo (builds are therefore unsigned test builds — see below).
- `.env.example` is a template only; no real `.env` is committed.
- Logs are sanitized to a fixed vocabulary (no message content, tokens, or
  filenames), so no secret leaks through committed logs.

---

## 6. Platform compatibility matrix

| Platform | Package | SimpleX asset | Status |
| --- | --- | --- | --- |
| **macOS arm64** | `Fuck-WhatsApp-macOS-arm64.zip` (`Fuck WhatsApp.app`) | `simplex-chat-macos-aarch64` | **Locally verified** — package builds AND smoke test PASS. |
| macOS x64 | (same `.app` layout, x64) | `simplex-chat-macos-x86-64` | Prepared in CI — **NOT locally verified**. |
| Windows x64 | `Fuck-WhatsApp-Windows-x64.zip` (`Fuck WhatsApp/` dir) | `simplex-chat-windows-x86-64` | Prepared in CI — **NOT locally verified**. |
| Linux x64 | `Fuck-WhatsApp-Linux-x64.tar.gz` (`Fuck WhatsApp/` dir) | `simplex-chat-ubuntu-24_04-x86_64` | Prepared in CI — **NOT locally verified**. |
| Linux arm64 | `Fuck-WhatsApp-Linux-arm64.tar.gz` (`Fuck WhatsApp/` dir) | `simplex-chat-ubuntu-24_04-aarch64` | Prepared in CI — **NOT locally verified**. |

Say it plainly where it matters: **Windows x64, Linux x64/arm64, and macOS x64
packages are prepared in CI — NOT locally verified.** Only macOS arm64 has been
built and smoke-tested locally.

**macOS runtime dependency:** the SimpleX macOS binary dynamically needs
`openssl@3.0`. The package **bundles** `libcrypto.3.dylib` + `libssl.3.dylib`
and the launcher sets `DYLD_LIBRARY_PATH` at spawn time. The SimpleX binary is
never modified, so its SHA-256 stays intact. This was proven with
`DYLD_PRINT_LIBRARIES` showing the bundled `libcrypto.3.dylib` being loaded.

**Signing:** macOS and Windows builds are **UNSIGNED test builds** (no signing
secrets configured). See `docs/CODE_SIGNING.md`.

---

## 7. Decision record

### 7.1 Why Node SEA (not Rust)

- The launcher + bridge are **already written in TypeScript/Node** and are the
  security-verified surface (bridge-auth 19/19, loopback-only, CSP, cookie
  auth). SEA reuses that exact, already-reviewed code with no rewrite.
- A **Rust toolchain was not available** in this environment to build and
  *verify* a Rust launcher, so choosing Rust would have meant shipping
  unverified code. SEA lets us ship what is proven.
- SEA **embeds the Node runtime**, so the user installs nothing — the core goal.

### 7.2 Why not Electron or Tauri

- The app is designed to **open in the user's own browser on `127.0.0.1`**.
  Electron/Tauri would bundle/embed a browser engine and change the trust and
  attack surface (a whole Chromium/WebView runtime) for no functional gain.
- Electron would add a large Chromium payload; Tauri would (again) require Rust.
- Both were **explicitly excluded** for this project. The chosen model — SEA
  launcher → loopback bridge → static server → the user's existing browser —
  keeps the shipped surface minimal and matches the verified security posture.

### 7.3 Provenance honesty

SimpleX does not publish signed checksums for every asset. The manifest labels
each pin honestly: `official-signed-sha256sums` where a signed `_sha256sums`
exists (linux-x64), otherwise `tofu-computed` (trust-on-first-use over TLS from
the official release asset). Independent re-verification against the SimpleX
release page is recommended before trusting a build.

---

## 8. Honest limitations (carried from the codebase)

- **DB passphrase in process list.** The SimpleX CLI only accepts the database
  passphrase via `-k`, so it is briefly visible in the local process list. This
  is a documented upstream limitation (`docs/KNOWN_LIMITATIONS.md`).
- **No code signing.** Builds are unsigned test builds; users will see OS
  "unidentified developer" / SmartScreen prompts.
- **Not a security guarantee.** There is no central Fuck WhatsApp backend. The
  app uses the SimpleX core and network; relays carry encrypted data;
  conversations are decrypted only on the participating devices. No claim of
  perfect security, total anonymity, or "no servers at all" is made.

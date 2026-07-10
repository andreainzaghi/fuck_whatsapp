# Distribution Architecture

How **FUCK WHATSAPP** ships as a single double-clickable app that needs no
install — no Node, no Docker, no SimpleX — and what happens from the moment the
user opens it.

> Unofficial, independent, open-source. NOT affiliated with WhatsApp, Meta, or
> SimpleX Chat. Messaging is powered by the official open-source SimpleX Chat
> core and network (AGPL-3.0). There is no central Fuck WhatsApp backend; Fuck
> Whatsapp implements zero cryptography of its own.

---

## 1. One-click flow

```
   ┌─────────────────────────────────────────────────────────────────────┐
   │  User double-clicks "Fuck WhatsApp"                                  │
   └───────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  SEA launcher (embedded Node runtime + bundled launcher/bridge)      │
   │   1. resolve resources (isSea() + execPath)                          │
   │   2. verify SimpleX binary present + SHA-256 matches recorded hash   │
   │   3. reserve two distinct random loopback ports (bridge + core)      │
   │   4. mint a fresh one-time bootstrap code                            │
   │   5. start static server + authenticated bridge on 127.0.0.1        │
   └───────────────┬───────────────────────────────────┬─────────────────┘
                   │ opens                              │ spawns on demand
                   ▼                                    ▼
   ┌───────────────────────────────┐    ┌──────────────────────────────────┐
   │ User's own browser            │    │ SimpleX Chat core (official CLI)  │
   │ http://127.0.0.1:<bridgePort> │    │ 127.0.0.1:<corePort> (WS)         │
   │  (bootstrap code in URL        │◄──►│  -d profile  -p corePort          │
   │   fragment, stripped at once)  │    │  stdout/stderr IGNORED at OS level│
   └───────────────────────────────┘    └────────────────┬─────────────────┘
                                                          │ encrypted transport
                                                          ▼
                                          ┌──────────────────────────────────┐
                                          │  SimpleX relays (network)         │
                                          │  carry ENCRYPTED data only        │
                                          │  decrypted only on participating  │
                                          │  devices                          │
                                          └──────────────────────────────────┘
```

Everything left of the relays runs on the user's machine, on the loopback
interface. Relays carry encrypted data; conversations are decrypted only on the
participating devices.

---

## 2. What is a SEA here

A **Node Single Executable Application**: the bundled launcher (`build/launcher.cjs`,
produced by esbuild) is injected as a blob into a copy of the host platform's
own official `node` binary (via `postject`), so the runtime and our launcher
ship as one executable. Build steps (`scripts/build-sea.mjs`):

1. Detect the SEA fuse sentinel from *this* Node build (it varies per version).
2. Write the SEA config and generate the blob (`--experimental-sea-config`).
3. Copy this platform's `node` as the base executable.
4. (macOS) strip the existing signature before injecting.
5. Inject the blob with `postject` (macOS also gets `--macho-segment-name NODE_SEA`).
6. (macOS) re-sign **ad-hoc** so the binary loads.

Cross-platform builds run this on each OS in CI, because the blob must be
injected into that OS's own `node`.

---

## 3. Package layouts per OS

### macOS — `Fuck WhatsApp.app`, zipped as `Fuck-WhatsApp-macOS-arm64.zip`

```
Fuck WhatsApp.app/
└── Contents/
    ├── MacOS/
    │   └── Fuck WhatsApp            ← SEA executable (embedded Node)
    └── Resources/
        ├── web/                     ← built Vite frontend (static)
        ├── bin/
        │   ├── simplex-chat         ← pristine official SimpleX core
        │   └── simplex-chat.sha256  ← recorded hash, re-checked at launch
        └── lib/
            ├── libcrypto.3.dylib    ← bundled openssl@3.0
            └── libssl.3.dylib
```
The zip also contains `README-FIRST.txt`, `THIRD_PARTY_NOTICES.txt`,
`SHA256SUMS.txt`.

### Windows / Linux — `Fuck WhatsApp/` directory

```
Fuck WhatsApp/
├── fuck-whatsapp[.exe]             ← SEA executable (embedded Node)
├── resources/
│   ├── web/                        ← built Vite frontend (static)
│   ├── bin/
│   │   ├── simplex-chat[.exe]      ← pristine official SimpleX core
│   │   └── simplex-chat.sha256
│   └── lib/                        ← (Linux: bundled libs if needed; Windows: n/a)
├── README-FIRST.txt
├── THIRD_PARTY_NOTICES.txt
└── SHA256SUMS.txt
```
Archived as `Fuck-WhatsApp-Windows-x64.zip`, `Fuck-WhatsApp-Linux-x64.tar.gz`,
`Fuck-WhatsApp-Linux-arm64.tar.gz`.

> Status: **macOS arm64 is locally verified.** macOS x64, Windows x64, and Linux
> x64/arm64 are **prepared in CI — NOT locally verified.**

---

## 4. How resources are resolved

The launcher decides "am I packaged?" with the SEA API and locates its files
from the executable path — never from the current working directory.

- **Packaged detection:** `import('node:sea').isSea()`.
- **Resources dir** (`resourcesDir()`):
  - macOS `.app`: `.../Contents/MacOS/<exe>` → `.../Contents/Resources`.
  - Windows/Linux portable: `resources/` sibling of the executable.
- Resolved paths when packaged: `bin/<simplex-chat>`, `web/`, `lib/` under the
  resources dir.
- **Environment overrides always win** (for tests / advanced users):
  `FWA_SIMPLEX_BIN`, `FWA_WEB_ROOT`, `FWA_PROFILE_DIR`, `FWA_LIB_DIR`,
  `FWA_ROOT`, `FWA_SOCKS_PROXY`. Otherwise packaged layout, then the dev/repo
  layout.

### App-data directory (per OS)

The encrypted profile/database is stored in the OS-standard per-user app-data
dir — **never beside the executable**:

| OS | App-data path |
| --- | --- |
| macOS | `~/Library/Application Support/Fuck WhatsApp` |
| Windows | `%APPDATA%\Fuck WhatsApp` (falls back to `…\AppData\Roaming\Fuck WhatsApp`) |
| Linux | `$XDG_DATA_HOME/fuck-whatsapp` (falls back to `~/.local/share/fuck-whatsapp`) |

The SQLCipher database is born-encrypted and lives under `…/profile`.

---

## 5. Launch-time integrity gate

Before the SimpleX binary is ever executed, the launcher recomputes its SHA-256
and compares it to the hash recorded in `simplex-chat.sha256` (written at
download/verify time). A binary swapped *after* install is refused, not run.
This is defense-in-depth against the "substituted SimpleX binary" threat.

---

## 6. macOS openssl bundling + `DYLD_LIBRARY_PATH`

The macOS SimpleX binary dynamically links `openssl@3.0`
(`libcrypto.3.dylib`, `libssl.3.dylib`). Rather than require a system install:

- Those two dylibs are **bundled** in `Contents/Resources/lib/`.
- When spawning the core, the launcher passes that `lib/` dir as `libDir`, and
  `core-process.ts` prepends it to the dynamic-library search path
  (`DYLD_LIBRARY_PATH`) **for the spawned child only**.
- The **SimpleX binary is never modified** — no `install_name_tool`, no
  re-signing of the core — so its SHA-256 stays exactly what the manifest pins.

Proven with `DYLD_PRINT_LIBRARIES`: the bundled `libcrypto.3.dylib` is the one
loaded.

> Caveat for future signing: `DYLD_LIBRARY_PATH` is honored only for
> **non-hardened** spawns. If a hardened runtime is later adopted, this
> mechanism must change — see `docs/CODE_SIGNING.md`.

---

## 7. Startup sequence

1. Create logger; detect packaged vs dev.
2. Resolve `binPath`, `webRoot`, `profileDir`, `libDir` (overrides → packaged →
   dev). Exit with a clear stderr message if the SimpleX binary or the
   `web/index.html` is missing.
3. Verify SimpleX binary integrity (SHA-256).
4. Reserve two distinct random loopback ports (both probes held open at once so
   they cannot collide).
5. Mint a fresh one-time bootstrap code (new at every start).
6. Start the static server + authenticated bridge on `127.0.0.1:<bridgePort>`.
7. Open the user's browser at the loopback URL (bootstrap code in the URL
   fragment, stripped immediately by the frontend). If the browser can't be
   opened, the URL is printed to the terminal as a fallback.
8. The SimpleX core is spawned **on demand**, driven by onboarding (create
   profile / open profile), in a sandboxed profile directory with its own
   `files/` and `tmp/`, on the reserved random core port. Core stdout/stderr are
   ignored at the OS level (they can echo plaintext), and the display name is
   fed via stdin, never as a process argument.

---

## 8. Clean shutdown

A single `shutdown()` handler is wired to `SIGINT`, `SIGTERM`, and `SIGHUP`, and
to `uncaughtException` / `unhandledRejection` (exit code 1). On shutdown the
launcher logs a fixed `shutdown` code and tears down the bridge and the core
(`SIGTERM` to the child). On `exit` it also kills the child directly, so the
SimpleX core never outlives the launcher.

---

## 9. Local error-page behavior when the core fails

The core lifecycle is surfaced to the frontend through the bridge status as a
`CoreStatus` value: `no-profile | locked | starting | running | wrong-password |
error`. When the core crashes or cannot start, the status becomes `error` and
the locally-served SPA renders an in-app error screen (it is a hash-routing SPA;
any unknown path falls back to `index.html`, all served from the loopback static
server — no remote page, no CDN). A `wrong-password` status is shown distinctly
so the user can retry the passphrase.

Fatal launcher-level failures that happen *before* the server is up (missing
binary, missing frontend build, failure to start) are reported on **stderr**
(e.g. `SimpleX binary not found…`, `Frontend build not found…`,
`launcher failed to start`) and exit non-zero — there is no browser page yet in
those cases.

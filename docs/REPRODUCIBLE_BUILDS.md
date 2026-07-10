# Reproducible Builds

An honest account of what is reproducible in a **FUCK WHATSAPP** build today,
what is not yet, and exactly which toolchain versions are pinned.

> Reproducibility here means: given the same pinned inputs, the build produces
> the same functional artifact whose third-party components can be independently
> re-verified by hash. It does **not** yet mean byte-for-byte identical archives
> on every machine — read §3 for the gaps.

---

## 1. Centralized version

A single source of truth drives every version string:

- **`VERSION`** file = `0.1.0` (also `package.json` `version` `0.1.0`).
- The same version is shown in the app's About screen, in bootstrap/startup
  logs, in package/archive names, and in release notes.

Bumping a release is one edit to `VERSION` (kept in sync with `package.json`),
which then flows to package names and the About view.

---

## 2. What IS reproducible

### 2.1 Frontend (`apps/web`)

- Built with **Vite**, whose version and all transitive deps are pinned by the
  committed **`package-lock.json`** and installed with `npm ci`.
- No `latest`/floating ranges for build-critical tooling.
- No remote assets/fonts/CDN pulled at build time, so the build does not depend
  on external hosts that could drift.

Given the same lockfile and Node version, the frontend bundle content is
deterministic.

### 2.2 SimpleX core (pinned by SHA-256)

- `vendor/simplex/simplex-manifest.json` pins SimpleX **6.5.6**, with per-platform
  official GitHub release URL, size, and **SHA-256**.
- `scripts/download-simplex.mjs` verifies the SHA-256 **before** first use;
  `scripts/verify-simplex.mjs` re-verifies vs the manifest + install record and
  runs `--version`; the launcher re-checks the hash again at every startup.
- Provenance is labeled honestly: `official-signed-sha256sums` (linux-x64, taken
  from SimpleX's signed `_sha256sums`) vs `tofu-computed` (trust-on-first-use
  over TLS for macOS/Windows/aarch64, which SimpleX does not sign).

The core is therefore fully pinned and independently re-verifiable by anyone
against the official release page.

### 2.3 Launcher bundle (`build/launcher.cjs`)

- Produced by **esbuild `0.28.1`** (exact pin) from the compiled launcher.
- Same source + same esbuild version → the same bundle.

---

## 3. What is NOT yet reproducible (the honest gaps)

### 3.1 The embedded Node runtime in the SEA

The SEA executable is a copy of **the build machine's own `node`** with our blob
injected (`scripts/build-sea.mjs` copies `process.execPath`). It is
byte-for-byte reproducible **only if the exact same Node build is used**.

- We pin the Node **major line** via **`.nvmrc = 22`** and the reference builds
  use the **runner's official Node 22**. But `.nvmrc` pins a major, not an exact
  patch/build. Two machines on different Node 22 patch releases (or a
  distro-repackaged Node vs official Node) will embed different runtime bytes.
- **Recommendation to tighten:** pin an exact Node version+build in CI (e.g. via
  `actions/setup-node` with a fully specified version) and record which official
  Node build was embedded in the release notes / provenance.

### 3.2 Timestamps and signatures vary

- Archive members carry modification timestamps; injection and (ad-hoc or real)
  code-signing embed signature data. These differ per build/run, so the final
  `.zip`/`.tar.gz`/`.app` are **not** guaranteed byte-identical across machines
  even when all functional inputs match.
- macOS ad-hoc signing (and any future real signing) changes the executable's
  signature bytes by design.

### 3.3 Consequence

Today, reproducibility is **component-level**: the frontend content, the pinned
SimpleX core (by hash), and the launcher bundle are reproducible/re-verifiable;
the **whole-archive byte-for-byte** reproducibility is not yet achieved because
of the embedded Node build pin granularity plus timestamps/signatures. This is a
known gap, not a solved problem.

---

## 4. Toolchain pins (no `latest`)

| Component | Pin | Where |
| --- | --- | --- |
| Node | **22** (LTS; SEA needs ≥ 20) | `.nvmrc` (`engines.node = ">=20.0.0"`) |
| esbuild | **0.28.1** (exact) | `package.json` devDependencies |
| postject | **1.0.0-alpha.6** (exact) | `package.json` devDependencies |
| playwright | **1.61.1** (exact) | `package.json` devDependencies |
| SimpleX Chat core | **6.5.6** (per-platform SHA-256) | `vendor/simplex/simplex-manifest.json` |
| All other deps | locked | `package-lock.json` (installed via `npm ci`) |

No build-critical dependency uses a floating range or `latest`.

---

## 5. Canonical build pipeline

CI must run exactly these steps (per platform):

```
npm ci
npm run build                      # all workspaces incl. apps/web (vite) + launcher (tsc)
node scripts/download-simplex.mjs  # download pinned core for host, verify SHA-256 BEFORE use
node scripts/verify-simplex.mjs    # re-verify sha256 vs manifest + install record + --version
npm run bundle:launcher            # esbuild → build/launcher.cjs
node scripts/build-sea.mjs         # SEA blob + inject into host node (+ ad-hoc sign on mac)
npm run package                    # assemble package + archive + SHA256SUMS + <artifact>.sha256
node tests/e2e/smoke-package.mjs   # launch packaged app, drive onboarding in Chromium
                                   # (needs: npx playwright install chromium)
```

The SEA step must run on each target OS, because the blob is injected into that
OS's own Node.

---

## 6. Verifying a build

- **SimpleX core:** recompute SHA-256 of the shipped `bin/simplex-chat` and
  compare to `vendor/simplex/simplex-manifest.json` (and, for linux-x64, to
  SimpleX's signed `_sha256sums`). The launcher also re-checks this at startup.
- **Artifacts:** each release archive ships `SHA256SUMS.txt` and a per-artifact
  `<artifact>.sha256`. Recompute and compare.
- **Frontend/launcher:** rebuild from the pinned lockfile + toolchain and compare
  the frontend bundle and `build/launcher.cjs` content.

Do not expect the outer archive/`.app` to match byte-for-byte until the Node
build is exactly pinned and timestamps/signatures are normalized (§3).

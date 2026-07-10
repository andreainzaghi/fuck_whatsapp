# Supply-Chain Security

This document describes the controls FWA ("FUCK WHATSAPP") uses to reduce
supply-chain risk: how dependencies are pinned, how the SimpleX core binary is
obtained and verified, how CI is locked down, and how release artifacts are
made verifiable. It also states honestly **what is enforced today versus what
is aspirational / recommended** but not yet mechanically guaranteed.

FWA is early-stage software (v0.1.0). Treat the "aspirational" items as the
intended direction, not as guarantees.

---

## 1. Dependency pinning

### JavaScript / Node dependencies

- **Locked install.** The repository ships a committed `package-lock.json` and
  CI installs with **`npm ci`** (not `npm install`), so the exact resolved
  dependency tree from the lockfile is used — no silent version drift.
- **Minimal, exact-pinned build dev-deps.** The extra tooling needed to build
  the packaged app is small and pinned to exact versions:
  - `esbuild` **0.28.1** (bundles the launcher to a single CJS file)
  - `postject` **1.0.0-alpha.6** (injects the SEA blob into the Node binary)
  - `playwright` **1.61.1** (drives the packaged-app smoke test)
- **Node runtime pinned.** `.nvmrc` pins Node **22** (LTS). The Single
  Executable Application requires Node ≥ 20.

### The SimpleX Chat core (the most important dependency)

The SimpleX Chat CLI is the cryptographic core. It is **not vendored in git**
— committing a ~80–170 MB binary is avoided. Instead it is **downloaded
unmodified from the official GitHub release at build time** and verified before
any use:

- Pinned in [`vendor/simplex/simplex-manifest.json`](../vendor/simplex/simplex-manifest.json):
  - version **6.5.6** (`releaseTag: v6.5.6`),
  - the official `sourceRepository` and per-platform release-asset URLs,
  - a per-platform **SHA-256** and its **provenance**.
- `scripts/download-simplex.mjs` fetches the pinned asset over TLS and
  **verifies the SHA-256 *before* the binary is used**, writing
  `runtime/bin/simplex-chat` + `runtime/bin/simplex-chat.sha256`.
- `scripts/verify-simplex.mjs` re-verifies the SHA-256 against the manifest and
  the install record, and runs `--version` as a sanity check.

A checksum mismatch aborts the build.

### SimpleX checksum provenance and the TOFU risk

Provenance is recorded honestly per platform in the manifest:

| Platform | Provenance |
|---|---|
| `linux-x64` (`ubuntu-24_04-x86_64`) | **`official-signed-sha256sums`** — taken from the SimpleX project's signed `_sha256sums` release asset |
| `darwin-arm64`, `darwin-x64`, `windows-x64`, `linux-arm64` | **`tofu-computed`** — SHA-256 computed by this project from the official GitHub release asset over TLS (trust-on-first-use) |

**Why TOFU exists.** SimpleX publishes a signed `_sha256sums` file for v6.5.6
that covers **only the Linux assets**. For macOS, Windows, and Linux/aarch64
there is no upstream-published checksum to compare against, so FWA pins the
hash it computed the first time it downloaded the official asset over TLS.

**The TOFU risk.** Trust-on-first-use means the pin is only as trustworthy as
that first download. If the official asset had been tampered with at the moment
we first fetched it, we would have pinned a bad hash. TLS to GitHub is the only
integrity guarantee on that first fetch.

**Mitigations.**
- **Independent re-verification.** Anyone can, and should, re-verify the pinned
  hashes against the official release page
  (<https://github.com/simplex-chat/simplex-chat/releases/tag/v6.5.6>) before
  trusting a build. The pinned values are published in the manifest and in
  [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
- **CI re-downloads and re-verifies every build.** CI does not reuse a cached
  binary blindly: it runs `scripts/download-simplex.mjs` +
  `scripts/verify-simplex.mjs`, so the pinned SHA-256 is checked on every run.
  Any future change to the upstream asset would surface as a hash mismatch.
- **Linux-x64 is anchored to the upstream signed sums**, which is the strongest
  provenance available and can serve as a cross-check reference point.

See also [`docs/KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) for the TOFU
limitation in context.

---

## 2. Fetch hygiene — what we do *not* do

- **No `curl | sh` / `wget | bash`.** Nothing in the build pipes a remote
  script straight into a shell. Downloads are of specific, pinned, checksummed
  assets only.
- **No fork mirrors.** Dependencies come from their canonical sources (npm
  registry via the lockfile; the SimpleX binary from the official
  `simplex-chat/simplex-chat` GitHub releases) — not from re-hosted or forked
  mirrors.
- **No mutable tags/branches as dependencies.** The SimpleX core is pinned to
  an immutable release **tag + SHA-256**, not `latest`, not a moving branch. JS
  deps are pinned by the lockfile's resolved versions and integrity hashes.

---

## 3. CI / GitHub Actions hardening

The following are the **recommended and intended** hardening controls for this
repository's CI. Where a control is a documentation/process recommendation
rather than something mechanically enforced today, it is marked **(aspirational
/ recommended)**.

- **Actions pinned to commit SHAs.** Third-party (and first-party reusable)
  GitHub Actions should be referenced by full commit **SHA**, not by a mutable
  tag like `@v4`, so a compromised or retagged action cannot silently change
  behavior. **(recommended — verify in the workflow files)**
- **Minimal `GITHUB_TOKEN` permissions.** Workflows should set least-privilege
  permissions (default `contents: read`, granting `write` scopes only to the
  specific jobs that need them, e.g. release upload). **(recommended)**
- **Secret scanning in CI, including a private canary token.** CI should run
  secret scanning over the tree, and the repo maintains a **private canary
  token** whose appearance in a build or artifact indicates a leak. GitHub
  push-protection / secret scanning should be enabled on the repository.
  **(aspirational — enable in repo settings + CI)**
- **Dependency Review, CodeQL, and Dependabot.**
  - **Dependency Review** on pull requests to flag newly introduced vulnerable
    or badly licensed dependencies.
  - **CodeQL** static analysis on the FWA-original code (launcher / bridge /
    frontend).
  - **Dependabot** for dependency and GitHub-Actions update alerts/PRs.
  **(aspirational / recommended — enable in repo settings; keep updates pinned
  and reviewed rather than auto-merged.)**

The build pipeline itself is fixed and must be used verbatim by CI:

```
npm ci
npm run build
node scripts/download-simplex.mjs   # SHA-256 verified BEFORE use
node scripts/verify-simplex.mjs     # re-verify vs manifest + install record + --version
npm run bundle:launcher
node scripts/build-sea.mjs
npm run package                     # assembles package + zip/tar + SHA256SUMS + per-artifact .sha256
node tests/e2e/smoke-package.mjs    # launches the packaged app, drives onboarding, asserts local encrypted profile
```

---

## 4. Artifact integrity

Each released package is made independently verifiable:

- **`SHA256SUMS.txt` inside each package** — checksums of the package contents,
  including the pinned SimpleX binary's `simplex-chat.sha256`.
- **A per-artifact `.sha256`** alongside each distributable
  (`Fuck-WhatsApp-macOS-arm64.zip.sha256`, etc.), produced by
  `scripts/package-app.mjs`.
- **A combined checksum list at release time** so a downloader can verify every
  artifact from a single authenticated source (the GitHub release).

Because builds are currently **unsigned** (no code-signing secrets are
configured — see [`docs/KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md)),
checksums are the primary integrity mechanism today. Verify the checksum you
download against the value published on the GitHub release page.

---

## 5. Branch protection (recommended to document + enforce)

The following branch-protection settings are **recommended** for `main` and
should be enforced in repository settings (they are process/policy controls,
not something the code can guarantee) — **(aspirational / recommended)**:

- Require **pull request review** before merging to `main`.
- Require **passing CI** (build + the security/bridge-auth suites + the
  packaged-app smoke test where runnable) before merge.
- Restrict direct pushes to `main`; disallow force-pushes and branch deletion.
- Require the Actions-pinned-to-SHA and least-privilege-token conventions above
  to be respected in any workflow change.

---

## 6. Enforced vs. aspirational — summary

| Control | Status |
|---|---|
| Committed lockfile + `npm ci` | **Enforced** |
| Exact-pinned build dev-deps + `.nvmrc` Node 22 | **Enforced** |
| SimpleX core pinned by SHA-256, verified before use | **Enforced** |
| CI re-downloads + re-verifies the core every build | **Enforced** |
| No `curl\|sh`, no fork mirrors, no mutable tags/branches | **Enforced** |
| Per-package `SHA256SUMS.txt` + per-artifact `.sha256` | **Enforced** |
| Upstream-signed checksum for non-Linux assets | **Not available upstream** (TOFU pin + independent re-verify) |
| Actions pinned to commit SHAs | Recommended — verify in workflows |
| Minimal `GITHUB_TOKEN` permissions | Recommended |
| Secret scanning + private canary token | Aspirational — enable |
| Dependency Review + CodeQL + Dependabot | Aspirational — enable |
| Branch protection (PR review + passing CI on `main`) | Aspirational — enforce in settings |
| Code signing of release artifacts | **Not configured** (unsigned test builds) |

---

*FWA is not affiliated with WhatsApp, Meta, or SimpleX Chat Ltd. The SimpleX
core is used unmodified under AGPL-3.0; see
[`docs/LICENSE_COMPLIANCE.md`](LICENSE_COMPLIANCE.md).*

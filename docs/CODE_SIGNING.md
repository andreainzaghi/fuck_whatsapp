# Code Signing

How to sign **FUCK WHATSAPP** builds when signing secrets exist, and what the
current unsigned test builds mean for users.

> Unofficial, independent, open-source. NOT affiliated with WhatsApp, Meta, or
> SimpleX Chat.

---

## 1. Current state: UNSIGNED TEST BUILDS

**No signing secrets are configured in this repository, so the released builds
are UNSIGNED TEST BUILDS.** On macOS the SEA executable is only **ad-hoc**
signed (`codesign --sign -`), which lets it load locally but is not a Developer
ID signature and is not notarized.

What users see, and the safe fix (never weaken OS protections globally):

- **macOS — "unidentified developer" / "cannot be opened".**
  Fix: **right-click the app → Open**, then confirm once. Do **not** disable
  Gatekeeper (`spctl --master-disable`) globally.
- **Windows — SmartScreen warning.**
  Fix: **More info → Run anyway**. Do **not** disable SmartScreen.
- **Linux** — no OS signing gate; verify the archive against `SHA256SUMS.txt`.

These prompts are expected for unsigned software and are the correct, honest
user experience. The `README-FIRST.txt` in each package explains them.

---

## 2. macOS signing (when secrets exist)

Requires an Apple **Developer ID Application** certificate and an Apple Developer
account for notarization.

### 2.1 Secrets the workflow reads

| Secret / env name | Meaning |
| --- | --- |
| `MACOS_CERTIFICATE_P12_BASE64` | Developer ID Application cert + private key, `.p12`, base64-encoded |
| `MACOS_CERTIFICATE_PASSWORD` | Password for the `.p12` |
| `MACOS_SIGNING_IDENTITY` | Identity string, e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_NOTARY_APPLE_ID` | Apple ID used for notarization (or use an API key, below) |
| `APPLE_NOTARY_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_NOTARY_KEY_ID` / `APPLE_NOTARY_KEY_ISSUER_ID` / `APPLE_NOTARY_KEY_P8_BASE64` | Alternative: App Store Connect API key for `notarytool` |

### 2.2 Steps

1. Decode `MACOS_CERTIFICATE_P12_BASE64` into a temporary keychain unlocked with
   `MACOS_CERTIFICATE_PASSWORD`.
2. **Sign** the SEA executable and the `.app` with `codesign` using
   `MACOS_SIGNING_IDENTITY` (deep sign the bundle; timestamped).
3. **Notarize** the zipped `.app` with `xcrun notarytool submit … --wait` (Apple
   ID + app-specific password, or the API key variant).
4. **Staple** the ticket: `xcrun stapler staple "Fuck WhatsApp.app"`.
5. Re-zip and re-emit checksums (`SHA256SUMS.txt`, per-artifact `.sha256`).

> Signing/notarization mutates only the **launcher executable and the app
> bundle**, not the pristine `bin/simplex-chat`. The SimpleX core's SHA-256 stays
> exactly what the manifest pins (see §4 for the hardened-runtime exception).

### 2.3 Hardened runtime + `DYLD_LIBRARY_PATH` (important)

The macOS openssl bundling relies on the launcher setting `DYLD_LIBRARY_PATH`
for the spawned SimpleX core (see `docs/DISTRIBUTION_ARCHITECTURE.md`).

- `DYLD_LIBRARY_PATH` is **honored only for non-hardened spawns.** A plain
  Developer ID signature **without** the hardened runtime keeps this working.
- **If a hardened runtime is later enabled** (it is generally required alongside
  notarization), the OS **strips `DYLD_*` environment variables** from the child,
  and the current bundling mechanism **breaks**. In that case switch to:
  1. Rewriting the core's library references to `@rpath` and adding an `@rpath`
     (e.g. with `install_name_tool`) pointing at the bundled `lib/`, then
  2. **Re-signing the SimpleX core** so the modified binary is valid.
- **Consequence for the integrity model:** modifying + re-signing the core
  **changes its SHA-256**, so it will no longer match
  `vendor/simplex/simplex-manifest.json`. The integrity model must then be
  updated: record the *post-processing* hash, verify the *upstream* asset hash at
  download time (before modification), and document that the shipped core is a
  re-linked+re-signed derivative of the pinned upstream binary. Do not silently
  break the "pristine core, hash intact" guarantee — update the docs to match.

---

## 3. Windows signing (Authenticode)

### 3.1 Secrets the workflow reads

| Secret / env name | Meaning |
| --- | --- |
| `WINDOWS_CERTIFICATE_PFX_BASE64` | Authenticode code-signing cert + key, `.pfx`, base64-encoded |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the `.pfx` |
| `WINDOWS_SIGN_TIMESTAMP_URL` | RFC-3161 timestamp server URL (optional; recommended) |

### 3.2 Steps

1. Decode `WINDOWS_CERTIFICATE_PFX_BASE64` to a temp file.
2. Sign `fuck-whatsapp.exe` with `signtool sign /f <pfx> /p <password>
   /fd SHA256 /tr <timestamp-url> /td SHA256`.
3. Re-emit checksums.

A standard OV certificate reduces but may not fully remove SmartScreen warnings
until reputation is established; an EV certificate clears them immediately.

---

## 4. Rules

- **Never commit** any certificate, key, password, or notary credential. All are
  read from CI secrets only. The repo's secret scan (`npm run test:security`)
  must stay clean.
- **Never instruct users to disable Gatekeeper or SmartScreen globally.** The
  documented fixes are per-app (right-click → Open; More info → Run anyway).
- When secrets are absent, the workflow must still succeed and clearly label the
  output as an **unsigned test build**, and the release notes must say so.
- Keep the exact env/secret names above as the contract the workflow reads, so
  enabling signing later is only a matter of adding the secrets.

# Release Checklist

Actionable pre-release checklist for **FUCK WHATSAPP**. Work top to bottom; do
not cut a release with any unchecked box unless the note explicitly allows it
(e.g. the unsigned-build notice).

> Unofficial, independent, open-source. NOT affiliated with WhatsApp, Meta, or
> SimpleX Chat. Messaging is powered by the official open-source SimpleX Chat
> core and network (AGPL-3.0). No central Fuck WhatsApp backend; zero
> first-party cryptography.

---

## 1. Version & metadata

- [ ] `VERSION` bumped and equal to `package.json` `version`.
- [ ] Version string appears correctly in About screen, bootstrap/startup logs,
      package/archive names, and release notes.
- [ ] `CHANGELOG` / release notes updated with user-facing changes.
- [ ] Git tag prepared to match the version (e.g. `v0.1.0`).

## 2. Tests

- [ ] Bridge-auth suite passes (**19/19**).
- [ ] Two-profile E2E passes (`npm run test:e2e`).
- [ ] Packaged smoke test passes (`node tests/e2e/smoke-package.mjs`; requires
      `npx playwright install chromium`) — packaged core creates an encrypted
      profile locally.
- [ ] Lint / typecheck clean (`npm run build` completes for all workspaces).

## 3. SimpleX core verification

- [ ] `node scripts/download-simplex.mjs` succeeds for each target platform.
- [ ] `node scripts/verify-simplex.mjs` passes: SHA-256 matches
      `vendor/simplex/simplex-manifest.json` and `--version` reports
      `SimpleX Chat v6.5.6`.
- [ ] Manifest pin unchanged (or intentionally updated via
      `scripts/update-simplex-manifest.mjs --confirm`, with provenance recorded).
- [ ] linux-x64 hash cross-checked against SimpleX's signed `_sha256sums`;
      `tofu-computed` pins re-checked against the official release page.

## 4. Checksums

- [ ] `SHA256SUMS.txt` generated for the release set.
- [ ] Per-artifact `<artifact>.sha256` present for each archive.
- [ ] Shipped `bin/simplex-chat` hash matches the manifest.

## 5. Secrets / private data hygiene

- [ ] Secret scan clean (`npm run test:security` — `security-check.mjs` +
      `canary-scan.mjs`).
- [ ] **No** signing certs, keys, passwords, or notary credentials committed.
- [ ] **No** SQLCipher database, profile directory, or `.env` in the repo or in
      any artifact.
- [ ] **No** personal files, local paths, tokens, or message content in logs or
      packaged assets (logs are fixed-vocabulary / sanitized).

## 6. Licenses & attribution

- [ ] License files present (`LICENSE`, `THIRD_PARTY_NOTICES.md`,
      `docs/LICENSES.md`), archive includes `THIRD_PARTY_NOTICES.txt`.
- [ ] SimpleX **AGPL-3.0** attribution present and the source-availability duty
      honored (link to the SimpleX source and to this project's source).
- [ ] Non-affiliation disclaimer present (not affiliated with WhatsApp / Meta /
      SimpleX; SimpleX/WhatsApp/Meta logos NOT used as the app logo).

## 7. Privacy & claims review

- [ ] Docs and UI make **no absolute-security claims** (no "unhackable",
      "100% secure", "total anonymity", "no servers at all", "impossible to
      read").
- [ ] The correct explanation is present: no central Fuck WhatsApp backend; the
      app uses the SimpleX core and network; relays carry encrypted data;
      conversations are decrypted only on participating devices.
- [ ] Known limitations documented (DB passphrase visible via `-k` in the local
      process list; unsigned builds).

## 8. Per-platform builds

- [ ] macOS arm64 — built (**locally verified**).
- [ ] macOS x64 — built in CI (**NOT locally verified** — note in release notes).
- [ ] Windows x64 — built in CI (**NOT locally verified**).
- [ ] Linux x64 — built in CI (**NOT locally verified**).
- [ ] Linux arm64 — built in CI (**NOT locally verified**).
- [ ] Each package has the correct layout, `README-FIRST.txt`,
      `THIRD_PARTY_NOTICES.txt`, `SHA256SUMS.txt`.
- [ ] macOS packages bundle `libcrypto.3.dylib` + `libssl.3.dylib`; core stays
      pristine (SHA-256 intact).

## 9. Smoke / canary / network tests

- [ ] **Smoke test:** packaged app launches, browser opens on `127.0.0.1`,
      onboarding creates an encrypted profile.
- [ ] **Canary test:** `tests/security/canary-scan.mjs` finds no planted secret
      canaries in artifacts.
- [ ] **Network test:** app binds loopback only; core reaches SimpleX relays for
      real messaging (verified separately from local profile creation); no
      unexpected outbound connections from the launcher/bridge (no
      analytics/telemetry/CDN).

## 10. Release notes

- [ ] Release notes list version, changes, per-platform verification status
      (macOS arm64 verified; others prepared in CI, not locally verified).
- [ ] Vulnerability reporting points to **GitHub Private Vulnerability Reporting**
      (do not invent an email address).
- [ ] Links to SimpleX upstream + AGPL source, and to this repo's source.

## 11. Artifacts & signing notice

- [ ] All archives + their `.sha256` + `SHA256SUMS.txt` attached to the release.
- [ ] **Signing status stated explicitly:**
  - [ ] If signing secrets exist: macOS signed + notarized + stapled; Windows
        Authenticode-signed; checksums re-emitted after signing.
  - [ ] If not (current default): release clearly labeled **UNSIGNED TEST
        BUILDS**, with the safe per-app open instructions (macOS right-click →
        Open; Windows More info → Run anyway) and an explicit "never disable
        Gatekeeper/SmartScreen globally" note.

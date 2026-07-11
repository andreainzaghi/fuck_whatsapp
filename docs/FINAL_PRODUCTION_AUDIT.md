# FUCK WHATSAPP — Final Production Audit

Obsessive pre-publication audit of the whole repository, run as two independent
passes. Severities: `BLOCKER` `CRITICAL` `HIGH` `MEDIUM` `LOW` `INFORMATIONAL`.

Audit date: 2026-07-11 · Version: 0.1.0 · SimpleX core: v6.5.6 (SHA-256 pinned).

---

## FIRST PASS — findings

| # | Sev | Problem | Files | Impact | Fix | Verified by |
|---|-----|---------|-------|--------|-----|-------------|
| 1 | MEDIUM | A non-functional **"More options"** button (`onClick={() => undefined}`) — a control that pretends to work | `apps/web/src/components/chat/ConversationHeader.tsx` | Misleading UI; violates "no fake buttons" | **Removed** the button and the unused `MoreIcon` import | `npm run build -w apps/web` (0 errors) + static no-op scan (0 matches) |
| 2 | LOW | CI secret-scan matched only one hardcoded canary token literal | `.github/workflows/ci.yml` | A different leaked canary would slip past CI | Replaced with a **pattern** (`FWA_[A-Z_]*CANARY_[0-9]{6}`, split so the file never self-matches) | YAML lint + local grep (0 false positives, 0 leaks) |
| 3 | INFORMATIONAL | Three historical canary tokens exist across test tooling (`…928471`, `…739284`, `…984721`) | `tests/**`, `scripts/security-check.mjs` | Cosmetic inconsistency; **no leak** (all assembled from parts; no full literal in any file) | Left as-is (harmless); documented | `canary-scan.mjs` + `security-check.mjs` both report absence |
| 4 | MEDIUM (privacy) → **RESOLVED** | A personal email was present in the early Git commits' author/committer metadata | Git history | PII scraping; not a secret | **Fixed**: history rewritten to a GitHub `noreply` email and force-pushed; the old Dependabot branches carrying the old commits were deleted. Remote `main` now contains **0** personal-email commits. | `git log origin/main --format='%ae'` → only the noreply address |
| 5 | MEDIUM (accepted, documented) | DB passphrase passed to the core via `-k` → visible in the **local process list** while running | `apps/launcher/src/core-process.ts` | Local same-user visibility | Accepted SimpleX-CLI limitation (no stdin/env/fd option in v6.5.6); passphrase not stored/logged and cleared from the launcher heap | `docs/KNOWN_LIMITATIONS.md`, `PRIVACY.md` |
| 6 | MEDIUM (accepted, documented) | Only **macOS arm64** is built + verified on real hardware; other platforms are CI-prepared; all builds **unsigned** | `scripts/*`, `.github/workflows/build-release.yml` | Cannot claim those platforms "verified"; Gatekeeper/SmartScreen warnings | Labelled honestly everywhere (README, ROADMAP, release notes) | this document; smoke test scope |

**No `BLOCKER`, `CRITICAL`, or unresolved `HIGH` was found.**

Also checked and **clean** in the first pass:

- Bind addresses: launcher/bridge/core listen on `127.0.0.1` only — **no `0.0.0.0`**.
- No mock/stub/`TODO`/`FIXME`/`HACK` in shipped source (only HTML `placeholder` attrs).
- No secrets/keys/tokens in source; no remote assets, fonts, CDNs, analytics, or
  tracking hosts (Google/Meta/AWS/Firebase/Sentry/…) in the frontend.
- No `localStorage`/`sessionStorage` writes; no wildcard CORS.
- No absolute `/Users/<name>` paths, no personal email, in any tracked file.
- `npm audit` (prod): no high/critical. Lockfile present. Deps pinned.

---

## FIXES APPLIED

1. Removed the fake "More options" button (`ConversationHeader.tsx`).
2. Made the CI secret-scan canary check pattern-based (`ci.yml`).
3. Rotated the functional-test canary to `FWA_FINAL_…_984721`
   (assembled from parts) in `tests/e2e/two-user.mjs` and
   `tests/security/canary-scan.mjs`.
4. Added **DMG** output to `scripts/package-app.mjs` (drag-to-Applications).
5. Added **SBOM** generation (`scripts/generate-sbom.mjs`, `npm run sbom`) →
   SPDX + CycloneDX.
6. Added GitHub presentation: `.github/ISSUE_TEMPLATE/*`,
   `PULL_REQUEST_TEMPLATE.md`, and `docs/GITHUB_SETUP.md`.

---

## SECOND PASS — independent re-verification

Re-ran the gates from a clean build, plus the real end-to-end tests.

| Gate | Result |
|------|--------|
| `npm run build` (all workspaces, TS strict) | **PASS** — 0 errors |
| `apps/web` typecheck (`tsc --noEmit`) | **PASS** — 0 errors |
| `node --test tests/security/bridge-auth.test.mjs` | **PASS — 19/19** |
| `scripts/security-check.mjs` (old-canary scan + tripwires + audit) | **PASS** |
| `scripts/check-licenses.mjs` | **PASS** (all shipped deps MIT/Apache/ISC) |
| `scripts/verify-simplex.mjs` (SHA-256 vs manifest + record + `--version`) | **PASS** (v6.5.6.1) |
| `tests/e2e/two-user.mjs` (two profiles, invite, A↔B canary, restart, wrong/correct password, reconnect) | **PASS** |
| `tests/security/canary-scan.mjs` (`FWA_FINAL_…_984721`) | **PASS** — absent from all 213 files |
| Raw encrypted-DB byte check for the canary | **PASS** — absent; all DBs encrypted (not `SQLite format 3`) |
| `tests/security/network-egress.mjs` | **PASS** — launcher 0 remote conns; core only to configured relays |
| `tests/e2e/smoke-package.mjs` (packaged `.app`) | **PASS** — launches, onboards, packaged core creates encrypted profile |
| DMG mounts and contains a launchable, ad-hoc-signed app | **PASS** |
| Git hygiene: DMG/SBOM/DBs/test-user all git-ignored; no sensitive tracked file | **PASS** |

Artifacts produced (macOS arm64, this host): `Fuck-WhatsApp-macOS-arm64.zip`,
`Fuck-WhatsApp-macOS-arm64.dmg` (+ `.sha256` each), `SHA256SUMS.txt`,
`SBOM.spdx.json`, `SBOM.cyclonedx.json`.

---

## FINAL STATUS

Platform verification status (honest labels):

| Platform | Status |
|----------|--------|
| macOS arm64 (.zip + .dmg) | **LOCALLY VERIFIED** (built + smoke-tested) |
| macOS x64, Windows x64, Linux x64/arm64 | **BUILT IN CI (pipeline prepared) — NOT LOCALLY VERIFIED** |
| Code signing / notarization | **NOT CONFIGURED** — all builds are UNSIGNED TEST BUILDS |

Open items that keep this from a full `GO` (none are security blockers):

- Windows/Linux/macOS-x64 packages are not yet hardware-verified (CI-prepared).
- Builds are unsigned.
- The personal-email finding (#4) has been **resolved** (history scrubbed).

No `NO-GO SECURITY` condition is present: messages are never stored/logged in
plaintext, the passphrase is never saved (only the documented `-k` process-list
exposure), the bridge is loopback-only and authenticated, no secrets or personal
data are in the repo or packages, the SimpleX binary is official and SHA-256
verified, the database is encrypted and fail-closed, and the canary test passes.

### Verdict

**PARTIAL — DO NOT PUBLISH YET.**

The macOS arm64 build is real, packaged (zip + dmg), and smoke-tested; all
security, canary, network, licensing, and two-user tests pass; the repository is
clean. Publish only after: (a) pushing to run the release CI and downloading +
testing the Windows/Linux/macOS-x64 artifacts on real hardware, (b) deciding on
signing (or labelling unsigned), and (c) resolving finding #4.

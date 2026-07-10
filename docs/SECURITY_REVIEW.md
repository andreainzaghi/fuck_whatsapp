# Security Review — FWA MVP (2026-07-10)

This records the adversarial security review performed before the `GO MVP`
verdict, and the fixes applied as a result. It complements
[`THREAT_MODEL.md`](./THREAT_MODEL.md) (what we defend against) and
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) (what we accept).

## Method

Six independent review dimensions were run against the actual code — bridge
authz, file/path confinement, WS-proxy & core process, frontend & CSP,
logging/leakage, and supply-chain/binary integrity. Every non-informational
finding was then handed to a separate adversarial verifier whose default
verdict was "refuted", to eliminate plausible-but-wrong findings.

Result: **15 findings confirmed or partial, 2 refuted, 0 critical, 0 high.**
The confirmed set was all *reliability / local-DoS / defense-in-depth* — no
finding broke confidentiality, the E2EE boundary, or the loopback perimeter.

## Findings and dispositions

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | med | `/_start` failure in open-mode misclassified as `wrong-password`, tearing down a correctly-decrypted core | **Fixed** — distinct `CoreStartFailedError`; only a genuine early exit maps to `wrong-password` (`core-process.ts`, `index.ts`) |
| 2 | low | DB passphrase kept in the launcher heap for the session via `child.spawnargs` | **Fixed** — `args` overwritten and `spawnargs` cleared right after spawn (`core-process.ts`) |
| 3 | low | Unguarded stdin write for the display name could crash the launcher if the core dies early (EPIPE) | **Fixed** — stdin `error` sink + writable guard (`core-process.ts`) |
| 4 | low | Launcher death via SIGHUP / uncaughtException / unhandledRejection could orphan a running core holding the decrypted DB | **Fixed** — SIGHUP + exception handlers + synchronous `exit` kill of the child (`index.ts`) |
| 5 | low | Port allocation race: bridge and core probes could alias to the same port | **Fixed** — `reserveTwoPorts` holds both probe sockets open simultaneously (`index.ts`) |
| 6 | low | Bootstrap attempt counter incremented before validation → 10 junk requests could lock out the legitimate user | **Fixed** — counter now advances only for well-formed candidates that reach the comparison; the 10-guess cap still holds for real guesses (`auth.ts`) |
| 7 | low | Staging directory had no cumulative cap (disk-fill via many un-sent uploads) | **Fixed** — `STAGING_MAX_BYTES` (512 MB) enforced in `stageUpload`; `/api/upload` returns 507 when full (`files.ts`, `bridge.ts`) |
| 8 | low | Rate limiters keyed globally, not per-client | **Documented as intentional** — single-user loopback bridge; comment + threat-model note added (`bridge.ts`) |
| 9 | info | JSON/error responses omitted CSP / anti-framing headers | **Fixed (defense in depth)** — `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` + `X-Frame-Options: DENY` on all JSON responses (`bridge.ts`) |
| 10 | info | `confinePath` docstring and logger comment slightly overstated behavior | **Fixed** — comments corrected to match code (`files.ts`, `log.ts`) |
| 11 | partial | TOCTOU between `realpath` confinement and the read | **Accepted** — inside the local-only threat model; documented |
| — | refuted | "Launcher runs the binary without checksum verification" | **Hardened anyway** — a launch-time SHA-256 gate (`verifyBinaryIntegrity`) now re-checks the install-time manifest before executing the binary; a binary swapped after install is refused (verified: tampering the binary makes the launcher exit 1). Directly addresses the "substituted SimpleX binary" threat. |
| — | refuted | "macOS OpenSSL dylib loaded from user-writable Homebrew prefix" | **Accepted** — same-user write access is already inside the "compromised device" boundary; documented |

## Verification after fixes

All suites re-run green on the patched code:

- `node --test tests/security/` — **19/19** (16 original + 3 new: bootstrap
  budget not burned by malformed input, brute-force cap still holds, staging
  ceiling).
- `tests/e2e/two-profile-canary.mjs` — PASS (two real profiles, canary over the
  SimpleX network, restart persistence, wrong-password rejected).
- `tests/e2e/ui-two-profile.mjs`, `ui-unlock-views.mjs`, `ui-attachments.mjs` —
  PASS (real browsers: onboarding, invitation+QR, messaging, unlock+history,
  Network/Settings, image + voice attachments via XFTP).
- `tests/security/network-egress.mjs` — PASS (launcher 0 remote connections;
  core talks only to its configured SimpleX relays).
- `scripts/security-check.mjs` — PASS (canary absent from all files incl.
  encrypted DBs; `npm audit` clean; no web-storage/remote-URL/wildcard-CORS).
- Tampered-binary negative test — launcher refuses to run (exit 1).
- `npm run build` — all workspaces, 0 TypeScript errors.

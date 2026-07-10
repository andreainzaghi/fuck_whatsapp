# Contributing to FUCK WHATSAPP

Thanks for your interest in improving FWA. This is an unofficial, independent,
open-source project (AGPL-3.0) that wraps the **official, unmodified SimpleX
Chat core**. Please read this before opening a pull request.

## Ground rules

- FWA implements **no cryptography of its own** and adds **no remote backend**.
  Contributions must not change that.
- FWA is **not affiliated with WhatsApp, Meta, or SimpleX Chat**. Do not add the
  WhatsApp/Meta/SimpleX logos as app branding, and do not imply affiliation.
- Be honest in docs and UI: no absolute-security or absolute-anonymity claims.

## Getting set up

Prerequisites: Node.js **22** (see `.nvmrc`).

```sh
npm ci
npm run setup     # downloads + verifies the pinned SimpleX core for your host
npm run dev       # runs the launcher/bridge + web UI locally on 127.0.0.1
```

`npm run setup` downloads the SimpleX core from the official release URL pinned
in `vendor/simplex/simplex-manifest.json` and verifies its SHA-256 before use.

## Branches and pull requests

- Do not commit directly to `main`. Branch from `main`:
  - `feat/<short-name>` for features
  - `fix/<short-name>` for bug fixes
  - `docs/<short-name>` for documentation
- Keep PRs focused and reasonably small. Describe **what** changed and **why**.
- Reference any related issue.
- **CI must pass** before a PR can be merged (build + unit tests + security
  checks). Do not merge red.

## Code style

- **TypeScript strict mode.** Keep the code type-clean; do not weaken `tsconfig`
  strictness or add broad `any`s to silence errors.
- **No new runtime dependencies without prior discussion.** Every dependency is
  a supply-chain and licensing surface. Open an issue first. New deps must be
  AGPL-compatible and are pinned to exact versions.
- **No remote assets.** No CDN scripts, remote fonts, external stylesheets,
  remote images, analytics, or trackers. Everything must be self-contained and
  loadable offline.
- **No logging of message content.** Logs use a fixed vocabulary of event codes.
  Never log message bodies, contact names, file names, passphrases, tokens, or
  cookies.

## Security invariants you must preserve

These are non-negotiable. A change that breaks any of them will not be merged:

1. **Loopback-only.** The launcher/bridge binds to `127.0.0.1` and never listens
   on an external interface.
2. **Authentication stays intact.** Keep the HttpOnly, SameSite=Strict session
   cookie, the one-time bootstrap-token exchange, the `Origin`/`Host` checks,
   the rate limiting, and the strict CSP. Do not add cookie-readable-by-JS
   surfaces or `localStorage`.
3. **No plaintext logging.** No message content, credentials, tokens, or
   filenames in logs — ever.
4. **Encrypted-DB / fail-closed behavior is not weakened.** The database is born
   encrypted; do not introduce a code path that writes a plaintext database.
5. **The SimpleX core is used unmodified**, downloaded and verified by SHA-256
   against the manifest. Do not vendor a patched binary.

If you are unsure whether a change touches one of these, ask in the PR.

## Running the test suites

```sh
npm test                              # workspace unit tests
npm run test:security                 # security checks + canary scan
node tests/e2e/two-user.mjs           # two-profile end-to-end messaging
node tests/e2e/smoke-package.mjs      # packaged-app onboarding smoke test
```

The packaged smoke test needs Chromium: `npx playwright install chromium`.
Please run the relevant suites locally before opening a PR, and add or update
tests for behavior you change.

## Sign-off (DCO)

A Developer Certificate of Origin sign-off is **optional but appreciated**. To
add one, commit with `-s`:

```sh
git commit -s -m "fix: ..."
```

By contributing, you agree that your contribution is licensed under the
project's **AGPL-3.0** license.

## Reporting security issues

Do not open a public issue for a vulnerability. Use GitHub **Private
Vulnerability Reporting** on this repository.

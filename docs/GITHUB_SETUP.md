# GitHub repository setup (manual steps for the maintainer)

These are settings that live in the GitHub UI/API, not in the repo files. Do
them once, after pushing. Nothing here is automated by this repository.

## Repository basics

- **Description** (Settings → General):
  > A local-first, open-source messaging client with no phone number, no central account and no proprietary backend. Powered by the SimpleX protocol.
- **Website:** leave blank or point to the Releases page.
- **Topics** (repo home → ⚙ next to About): `privacy`, `messaging`, `simplex`,
  `end-to-end-encryption`, `local-first`, `open-source`, `react`, `nodejs`,
  `security`, `decentralized`.
  - _Note:_ do **not** add `rust` — this project uses a Node Single Executable
    Application, not Rust.
- **Visibility:** Public.

## Security

- **Private Vulnerability Reporting:** Settings → Code security → enable
  **Private vulnerability reporting**. `SECURITY.md` and the issue-template
  config already route reporters here.
- **Secret scanning + push protection:** Settings → Code security → enable
  **Secret scanning** and **Push protection** (free for public repos).
- **Dependabot:** `.github/dependabot.yml` is committed; ensure Dependabot
  **alerts** and **security updates** are enabled in Settings → Code security.
- **CodeQL:** `.github/workflows/codeql.yml` is committed and runs on push/PR +
  weekly; confirm it appears under Security → Code scanning after the first run.

## Branch protection (Settings → Branches → add rule for `main`)

- Require a pull request before merging (≥1 approval).
- Require status checks to pass — select the **CI** workflow's jobs once they
  have run at least once so they appear in the list.
- Require branches to be up to date before merging.
- Do not allow force pushes or deletions on `main`.
- (Optional) Require signed commits.

## Discussions (optional)

- Enable **Discussions** (Settings → General → Features) if you want a Q&A space;
  the issue-template config links to it.

## Releases

The release pipeline is tag-driven and **draft-only** by design:

1. Push a tag `vX.Y.Z` → `.github/workflows/build-release.yml` builds the
   per-OS packages, runs the packaged smoke test, generates checksums, and
   creates a **draft** GitHub Release with the artifacts attached.
2. **Review the draft manually.** Download and test the `.dmg`/`.zip`/`.exe`,
   verify `SHA256SUMS.txt`, then publish only if satisfied.
3. The workflow never auto-publishes a final release.

## Code-signing secrets (future — not required for unsigned test builds)

When you have signing identities, add these repository/environment secrets and
enable the signing steps documented in [`docs/CODE_SIGNING.md`](CODE_SIGNING.md):

- macOS: `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_TEAM_ID`, and notarization credentials (`APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` or an API key).
- Windows: `WINDOWS_CERTIFICATE_PFX_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`.

Until those exist, releases must be labelled **UNSIGNED TEST BUILD**.

## What is intentionally NOT configured

- **No `FUNDING.yml`** — there is no funding/sponsorship set up, so no funding
  file is committed (adding one with placeholder data would be misleading).
- No third-party analytics, apps, or integrations.

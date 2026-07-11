# Launch kit — Fuck WhatsApp v0.1.0

Copy-paste material for announcing the project. **Rule #1: stay honest.** The
privacy/tech crowd rewards candor and punishes hype. Every claim here is backed
by the repo. Don't astroturf, don't spam, don't overclaim.

**Do this first:** publish a real `v0.1.0` release (merge the CI fix, tag, let
CI build, test the artifacts, publish the draft). You cannot go viral with
nothing to download.

---

## The one-liner (use everywhere, verbatim)

> Private chat with **no phone number, no email, no account, no Meta.** It opens
> in your browser, runs entirely on your machine, and is powered by the
> open-source **SimpleX** protocol. Open source, local-first, no telemetry.

## The 3-line pitch

> **Fuck WhatsApp** is a local-first, open-source messaging app. There's no
> central backend and no account — your identity is a local encrypted database,
> and messages travel over the SimpleX network as ciphertext.
>
> It's early (v0.1.0) and honest about it: only the macOS Apple-Silicon build is
> hardware-tested so far, and builds are unsigned test builds. All the crypto is
> the audited SimpleX core's — we add zero of our own.

---

## Show HN (Hacker News)

**Title options** (HN dislikes hype and may rename; pick what you're comfortable
with):

- `Show HN: Fuck WhatsApp – local-first chat, no phone number, no account (SimpleX)`
- `Show HN: A browser-based, local-first chat with no phone number or account`

**Body:**

> This is a small, honest project: a local-first chat app that wraps the
> official, unmodified SimpleX Chat core. It opens in your browser at
> 127.0.0.1, stores an encrypted SQLCipher database on your device, and needs
> no phone number, email, or account. There is no backend of mine — SimpleX
> relays move ciphertext between devices.
>
> I wrote the launcher, a hardened loopback bridge (one-time bootstrap token →
> HttpOnly cookie, strict Origin/Host checks, CSP, rate limits), and a React
> UI. I implement **no cryptography** — that's all the SimpleX core, pinned by
> SHA-256 and verified before it runs. It's packaged as a Node Single
> Executable so users install nothing.
>
> Honest status: it's v0.1.0. Only the macOS Apple-Silicon package is tested on
> real hardware; Windows/Linux are built in CI but not yet hardware-verified;
> all builds are currently **unsigned**. Not affiliated with WhatsApp, Meta, or
> the SimpleX project. Feedback and security reports welcome (private reporting
> in SECURITY.md).
>
> Repo: https://github.com/andreainzaghi/fuck_whatsapp

Then reply to your own thread with the honest limitations first (process-list
passphrase caveat, unsigned builds, metadata is still observable by relays).
Owning the weaknesses up front earns trust on HN.

---

## Reddit

Good subreddits (read each one's self-promo rules first; post as a genuine
project share, engage in comments):
`r/privacy`, `r/degoogle`, `r/selfhosted`, `r/opensource`, `r/privacytoolsIO`,
`r/PrivacyGuides`.

**Title:** `I built an open-source, local-first chat with no phone number and no account (powered by SimpleX)`

**Body:** same as the Show HN body, minus the "Show HN" framing. Add: "I know
'X vs WhatsApp' posts get tired — this isn't 'more secure than everything', it's
a *different trust model*: no central account, no phone-number identity, open
source, servers you can replace."

---

## Mastodon / Fediverse

> New: **Fuck WhatsApp** — a local-first, open-source chat with no phone number,
> no email, no account, no Meta. Opens in your browser, runs on your machine,
> powered by @simplex 's protocol. Zero telemetry, source-available (AGPL-3.0).
> Early + honest about it. Boost if you're tired of renting your identity from a
> corporation. #privacy #SimpleX #opensource #Chatcontrol
>
> https://github.com/andreainzaghi/fuck_whatsapp

(Fediverse skews privacy-native and will actually read the honesty section.
Tie-in to the ongoing EU "Chat Control"/ePrivacy debate — see the README's
"Why now?" — makes it timely.)

---

## GitHub Release notes — v0.1.0 (paste into the release)

```markdown
# FUCK WHATSAPP v0.1.0 — Public MVP

No phone. No email. No central account. No Meta.

A local-first, open-source chat that opens in your browser and is powered by the
official **SimpleX Chat** core. There is no backend of ours, no account, and no
phone number. All end-to-end encryption is the SimpleX core's — this project
adds none of its own.

## Download
Pick the file for your computer (see the README's download guide):
- macOS (Apple Silicon): `Fuck-WhatsApp-macOS-arm64.dmg` / `.zip`
- macOS (Intel): `Fuck-WhatsApp-macOS-x64.zip`
- Windows x64: `Fuck-WhatsApp-Windows-x64.zip`
- Linux x64 / arm64: `Fuck-WhatsApp-Linux-x64.tar.gz` / `-arm64.tar.gz`

Verify your download against `SHA256SUMS.txt`.

## Honest status
- **macOS Apple Silicon**: built and smoke-tested on real hardware.
- **Windows / Linux / macOS Intel**: built in CI, **not yet hardware-verified**.
- **All builds are UNSIGNED test builds.** First launch: macOS → right-click →
  Open; Windows → More info → Run anyway. Don't disable Gatekeeper/SmartScreen.

## What works
Local encrypted profile · one-time invitations (link + QR) · 1:1 text · images,
files, voice notes · dark/light · configurable SimpleX servers · "Lock and
close".

## Security & privacy
Loopback-only authenticated bridge, strict CSP, encrypted local database
(fail-closed), no telemetry, no remote assets. SimpleX binary v6.5.6 pinned by
SHA-256 and verified before use. Known limitations are documented honestly in
`docs/KNOWN_LIMITATIONS.md`. No absolute-security claims.

## Not affiliated
Independent project. Not affiliated with WhatsApp, Meta, Instagram, Google, or
the SimpleX Chat project. AGPL-3.0.

SBOM (`SBOM.spdx.json`, `SBOM.cyclonedx.json`) and `THIRD_PARTY_NOTICES.txt` are
attached.
```

---

## Launch-day checklist

- [ ] CI is green on `main` (merge the CI-fix PR first).
- [ ] `v0.1.0` release published (draft reviewed, artifacts tested, checksums verified).
- [ ] README renders (banner + demo GIF + screenshots) in light and dark.
- [ ] Repo description + topics set (see `docs/GITHUB_SETUP.md`).
- [ ] Post Show HN in the morning (US time), then answer every comment honestly.
- [ ] Cross-post to 1–2 subreddits + Mastodon; don't blast all at once.
- [ ] Pin the "known limitations" honesty in your first comment on each thread.

**Anti-goals:** no fake stars, no sockpuppets, no "military-grade/unhackable"
language, no attacking child-safety orgs in the Chat Control tie-in — criticize
architectures and business models, not people.

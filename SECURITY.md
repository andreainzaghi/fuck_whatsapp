# Security Policy

FWA ("FUCK WHATSAPP") is an **unofficial, independent, open-source** local
private chat app. It is **not affiliated with, endorsed by, or connected to
WhatsApp, Meta, or SimpleX Chat Ltd.** Messaging is powered by the official,
unmodified open-source [SimpleX Chat](https://github.com/simplex-chat/simplex-chat)
core (AGPL-3.0). FWA implements **zero cryptography** of its own and runs **no
remote backend**.

Please read this policy before reporting. It explains what is in scope, how to
report privately, and what to expect.

---

## Supported versions

FWA is early-stage software (current version **0.1.0**). Only the latest
released version receives security fixes. There are no long-term-support
branches.

| Version | Supported |
|---------|-----------|
| 0.1.x (latest release) | Yes — best effort |
| Anything older | No |

We do not backport fixes. If you are on an older build, update to the latest
release before reporting, in case the issue is already fixed.

---

## How to report a vulnerability (privately)

**Please report security vulnerabilities privately through GitHub Private
Vulnerability Reporting.** Do **not** open a public issue, discussion, or pull
request for an undisclosed vulnerability, and do not post details on social
media or elsewhere until a fix is available.

To report:

1. Go to the repository:
   <https://github.com/andreainzaghi/fuck_whatsapp>
2. Open the **Security** tab.
3. Click **Report a vulnerability** (GitHub Private Vulnerability Reporting).
4. Fill in the private advisory form with the details below.

We do not publish or maintain a security contact email address. GitHub Private
Vulnerability Reporting is the only intended private channel — please use it
rather than emailing maintainers directly.

### What to include

A good report lets us reproduce and assess the issue quickly:

- A clear description of the vulnerability and its security impact.
- The affected component (launcher, bridge, frontend, packaging, build
  pipeline) and version / commit.
- Step-by-step reproduction, ideally with a minimal proof of concept.
- Your assessment of severity and any suggested remediation.
- Your platform (OS, architecture) and how FWA was installed (packaged build
  vs. from source).

### Coordinated disclosure

We follow coordinated disclosure. Please give us a reasonable window to
investigate and ship a fix before any public disclosure. When a fix is
released we will credit reporters who wish to be credited (let us know your
preference).

---

## Expected response window

FWA is a **small volunteer project**. Handling is **best effort**, with no
paid on-call rotation and **no bug bounty**. As a rough guide, and without any
contractual commitment:

- **Acknowledgement:** we aim to acknowledge a report within about **7 days**.
- **Assessment:** an initial assessment (valid / not / need more info) within
  about **30 days**.
- **Fix:** timelines depend on severity and complexity; critical issues are
  prioritized.

If you have not heard back within these windows, a polite follow-up on the
private advisory is welcome.

---

## Scope

### In scope — the FWA-original attack surface

Report issues in the parts of the system FWA actually writes and ships:

- **The launcher** (process supervision, environment/argument handling,
  passphrase/key handling on the FWA side, SimpleX binary integrity checks).
- **The local bridge** (loopback HTTP/WebSocket server, authentication —
  one-time bootstrap token, HttpOnly `SameSite=Strict` cookie, Host/Origin
  checks, rate limiting, CSP and other headers, request handling, logging).
- **The frontend** (the React/Vite web UI served on `127.0.0.1`), e.g. XSS,
  token/secret exposure, DNS-rebinding or cross-origin weaknesses.
- **Packaging and the build/supply-chain pipeline** (the Node Single
  Executable Application, download/verification of the SimpleX binary, bundled
  dylibs on macOS, checksums, release artifacts). See
  [`docs/SUPPLY_CHAIN_SECURITY.md`](docs/SUPPLY_CHAIN_SECURITY.md).

### Out of scope — the SimpleX core and protocol

The end-to-end encryption, the SimpleX protocol, the relay/network design, and
the SQLCipher database encryption are all implemented by the **unmodified
official SimpleX Chat core**, not by FWA. Vulnerabilities in the SimpleX
cryptography, protocol, core CLI, or relays should be reported to the **SimpleX
project**, which runs its own security process:

- SimpleX Chat: <https://github.com/simplex-chat/simplex-chat>
- SimpleX security policy: <https://github.com/simplex-chat/simplex-chat/blob/stable/docs/SECURITY.md>

If you are unsure whether an issue lives in FWA or in the SimpleX core, report
it to us privately and we will help route it (and coordinate with upstream
where appropriate).

---

## Threat model summary

FWA's own security job is narrow and specific: **safely broker a local web UI
to a local, unmodified SimpleX core, without weakening what the core provides
and without opening a network- or web-reachable hole on your machine.**

What FWA is designed to protect against:

- **Remote/network attackers.** The bridge and the core bind `127.0.0.1` only
  (loopback); nothing is exposed to the LAN or internet. There is no FWA
  backend to attack.
- **Malicious web pages / cross-origin attacks / DNS rebinding.** The bridge
  enforces strict `Host`/`Origin` allowlisting, an HttpOnly `SameSite=Strict`
  session cookie derived from a one-time bootstrap token (stripped from the URL
  fragment immediately), a strict CSP, and rate limiting.
- **Secret leakage to page JavaScript or logs.** No `localStorage`, no remote
  assets/fonts/CDN/analytics; the session token is HttpOnly; logs use a fixed,
  sanitized vocabulary (no message content, tokens, or filenames).
- **Tampered core binary.** The SimpleX binary is pinned by SHA-256 and
  verified before use; a mismatch aborts.
- **Confidentiality at rest.** The SQLCipher database is created encrypted from
  the first byte (fail-closed); FWA never writes a plaintext database.

### Explicitly out of scope of the threat model

FWA cannot and does not defend against attackers who already control your
device or its I/O. The following are **out of scope** (they defeat essentially
any chat application, including the official SimpleX apps):

- **A compromised device / same-user local malware.** Code running as your OS
  user can read process memory, keylog, read the browser tab, and observe the
  DB passphrase in the local process list (a known SimpleX CLI limitation — see
  [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md)).
- **Malicious or compromised browser extensions.** Extensions with access to
  the page can read and manipulate the UI.
- **Physical access to an unlocked machine**, and offline attacks against a
  disk without full-disk encryption (swap/crash dumps may contain plaintext).

For the full analysis see [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md),
[`docs/SECURITY_ARCHITECTURE.md`](docs/SECURITY_ARCHITECTURE.md), and
[`docs/LOCALHOST_SECURITY.md`](docs/LOCALHOST_SECURITY.md).

---

## No absolute-security claims

FWA makes **no** claims of being "unhackable", "100% secure", offering "total
anonymity", or being "impossible to read". There is no central FWA backend; the
app uses the SimpleX core and network; relays carry encrypted data; and
conversations are decrypted on the participating devices. Security depends on
the SimpleX core, your device's integrity, and your operational choices.

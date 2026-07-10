# Privacy

This document describes how FUCK WHATSAPP (FWA) handles your data. It is
specific to how this app is actually built. It is honest and deliberately avoids
absolute claims: no software can guarantee total privacy, security, or
anonymity, and a compromised device defeats any chat app.

FWA is an unofficial, independent, open-source app. It is **not affiliated with
WhatsApp, Meta, or SimpleX Chat**. Messaging is powered by the official,
unmodified open-source **SimpleX Chat** core and protocol.

## The short version

There is no central Fuck WhatsApp backend. The software uses the SimpleX core
and network. Relays carry encrypted data. Conversations are decrypted on the
participating devices.

## What FWA does NOT do

- **No FWA backend.** FWA operates no servers of its own. There is no service to
  connect to, and nothing is sent to us — because there is no "us" server.
- **No accounts.** There is no FWA account, login, or profile stored anywhere
  but on your device. No phone number and no email are required or requested.
- **No analytics or telemetry.** No usage tracking, no crash reporters, no
  advertising or fingerprinting, no phone-home. The UI loads no remote fonts,
  scripts, stylesheets, images, or CDN resources.
- **No collection of your messages.** FWA does not read, copy, upload, or
  transmit your message content to any FWA-operated destination. It keeps no
  parallel database of your conversations.
- **No plaintext logging.** Logs use a fixed vocabulary of event codes. Message
  content, contact names, file names, passphrases, and session tokens are not
  written to logs.

## Data stored on your device

FWA is local-first. Your data lives on your machine, in your OS app-data
directory (not next to the executable):

- **macOS:** `~/Library/Application Support/` (FWA app-data subdirectory)
- **Windows:** `%APPDATA%` (FWA app-data subdirectory)
- **Linux:** `$XDG_DATA_HOME` or `~/.local/share/` (FWA app-data subdirectory)

This includes:

- The **SQLCipher-encrypted database** created by the SimpleX core. It is
  created encrypted from the first write, and fails closed without your
  passphrase. If you lose the passphrase, the data cannot be decrypted — there
  is no recovery mechanism.
- **Files you receive**, stored locally.

You can delete this directory to remove your local data. Standard operating
practice applies: your device backups, disk images, or file-sync tools may copy
these files elsewhere depending on your own configuration.

## The browser session

The UI runs in your browser against `http://127.0.0.1:<random-port>`, bound to
loopback only. The session uses an HttpOnly, SameSite=Strict cookie exchanged
from a one-time bootstrap token; no `localStorage` is used; a strict Content
Security Policy is enforced. This session data is local to your machine.

## What the SimpleX network can see

FWA sends and receives messages over the **SimpleX** messaging network, which
acts as transport. This is the one place where data leaves your device, and it
is important to understand it honestly:

- **Relays carry ciphertext.** Message content is end-to-end encrypted by the
  SimpleX core and is decrypted only on the participating devices. Relays are
  not a Fuck WhatsApp service and are interchangeable.
- **Relay operators can observe some transport metadata.** Routing encrypted
  traffic necessarily exposes some transport-level metadata (for example, timing
  and connection patterns) to the relays involved. FWA cannot eliminate this.
- **Relays are configurable by you.** You can use the default SimpleX servers or
  configure different servers, including your own. Your choice of relay
  determines who operates the transport your traffic passes through.
- **Third-party terms apply.** When you use relays operated by others, those
  operators' terms and practices apply to that transport.

For the details of what SimpleX does and does not expose, consult the upstream
SimpleX Chat project's own documentation and privacy information. FWA does not
change the protocol's behavior.

## On-device plaintext

After messages are decrypted, their **plaintext is present on the participating
devices** — that is inherent to being able to read your messages. Anyone or
anything with access to your unlocked device or its memory can, in principle,
read decrypted content.

## Risks that remain

FWA cannot protect you from threats that operate on or around your device:

- **Malware and malicious browser extensions** running as your user can read the
  app, its memory, or your keystrokes.
- **Physical access** to an unlocked device, or to the device while the app is
  running, exposes decrypted content.
- **Process-list visibility of the passphrase.** The SimpleX CLI accepts the
  database passphrase only via a command-line argument, so while the app runs
  the passphrase is visible to processes running as your user. See
  [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md).
- **Your own backups, sync tools, and screenshots** may copy data off the
  device.

## Changes to this document

This document may change as the app evolves. Material changes will be reflected
in the repository history and the [CHANGELOG](CHANGELOG.md).

## Questions or reports

For privacy or security concerns, use GitHub **Private Vulnerability Reporting**
on this repository. Please do not open a public issue for a security matter.

FUCK WHATSAPP
No phone. No email. No central account. No Meta.

Unofficial independent project.
Not affiliated with, endorsed by or sponsored by WhatsApp or Meta.
Messaging network powered by the open-source SimpleX protocol and software.

--------------------------------------------------------------------------
WHAT THIS IS
--------------------------------------------------------------------------
A local, private chat app. Everything runs on YOUR computer:
  - the app opens in your normal web browser at http://127.0.0.1
  - messages are handled by the official SimpleX Chat core (all encryption)
  - there is NO Fuck WhatsApp server, NO account, NO phone number, NO email
You need to install nothing else — no Node, no Docker, no SimpleX.

--------------------------------------------------------------------------
HOW TO START
--------------------------------------------------------------------------
macOS:
  1. Double-click "Fuck WhatsApp.app".
  2. First time only: macOS may say it is from an unidentified developer
     (this is an UNSIGNED test build). Right-click the app -> Open -> Open.
     Do NOT disable Gatekeeper system-wide.
  3. Your browser opens automatically. Create your local identity.

Windows:
  1. Double-click "Fuck WhatsApp.exe".
  2. First time only: SmartScreen may warn (unsigned build).
     Click "More info" -> "Run anyway". Do NOT disable SmartScreen.
  3. Your browser opens automatically.

Linux:
  1. Make it executable if needed:  chmod +x "Fuck WhatsApp"
  2. Run:  ./"Fuck WhatsApp"
  3. Your browser opens automatically.

--------------------------------------------------------------------------
ADD A FRIEND
--------------------------------------------------------------------------
  1. Both of you open the app and create an identity.
  2. One of you: Connect -> Invite -> "Create one-time invitation".
  3. Send that link/QR to the other over a channel you already trust.
  4. The other: Connect -> Join -> paste the link (or scan the QR).
  5. You are connected. Chat.

--------------------------------------------------------------------------
YOUR DATA
--------------------------------------------------------------------------
Your encrypted database lives in your user data folder, NOT next to this app:
  macOS:   ~/Library/Application Support/Fuck WhatsApp/
  Windows: %APPDATA%\Fuck WhatsApp\
  Linux:   ~/.local/share/fuck-whatsapp/
It is protected by a password only you know. If you lose the password it
cannot be recovered.

--------------------------------------------------------------------------
VERIFY THIS DOWNLOAD
--------------------------------------------------------------------------
SHA256SUMS.txt lists the checksum of every file in this package. Compare it
against the checksums published on the GitHub Releases page.

See THIRD_PARTY_NOTICES.txt for licenses (this project is AGPL-3.0).

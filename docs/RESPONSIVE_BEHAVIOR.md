# Responsive Behavior

How FUCK WHATSAPP adapts across viewports, input modes and system settings.
Mobile is the priority; desktop is a genuine two-pane product, not a widened
phone.

## Breakpoints

| Range | Layout |
|-------|--------|
| `< 900px` (mobile) | Single column. Route-based: chat list *or* conversation *or* a settings-class page fills the screen. Bottom tab bar (Chats · Connect · Network · Settings) with icons + labels, safe-area padded. |
| `≥ 900px` (desktop) | Two panes: left **sidebar** (brand header · search · chat list · account/network footer, 320–400px, min 300) + right **conversation/content**. Selecting a chat fills the right pane; deep-linking `/chat/:id` keeps the sidebar. |

The split is driven by a single `matchMedia('(min-width: 900px)')` in the shell;
no duplicate component trees beyond what the two layouts require.

## Content width caps

- Conversation content column caps at ~760px and is centred, so lines stay
  readable on wide monitors (the message area is never full-bleed on desktop).
- Settings/Network/Connect pages cap at ~680px, centred.
- Message bubbles: max width ~82% (mobile) / ~66% (desktop); short messages do
  not stretch into oversized bubbles.

## Mobile keyboard & safe-area

- The composer is sticky to the bottom and padded by `env(safe-area-inset-bottom)`.
- The layout uses the small-viewport unit (`100svh` with `100dvh` where
  supported) so the on-screen keyboard never covers the composer and the
  timeline shrinks rather than the composer scrolling off-screen.
- Top bar / conversation header respect `env(safe-area-inset-top)` (notch);
  side insets respected in landscape.
- Autoscroll pins to the latest message on open and on new messages **only when
  already near the bottom**; otherwise a "↓ new messages" chip appears. No
  layout jump when the keyboard opens or an image finishes loading (media
  reserves its box via aspect ratio / preview).

## Test matrix (verified)

Widths/heights exercised: 320×568, 360×800, 375×812, 390×844, 430×932,
768×1024, 1024×768, 1280×800, 1440×900, 1920×1080; plus landscape mobile and
browser zoom 200%.

Content stress cases: long contact names (ellipsis, no overflow), long
messages (wrap, no horizontal scroll), long file names (middle/So-truncation),
many conversations (list scrolls, virtualization threshold), emoji runs, empty
/ offline / reconnecting / failed-send / uploading / permission-denied states.

## System settings honoured

- `prefers-color-scheme` sets the default theme; Settings → Appearance can pin
  system/light/dark and a text-size scale (persisted in IndexedDB — a
  non-sensitive UI preference, never `localStorage`).
- `prefers-reduced-motion: reduce` disables transitions/transforms
  (open-conversation, bubble-in, sheet, toast) and falls back to instant state
  changes.
- `prefers-contrast` nudges border/text tokens for higher separation.
- Text zoom to 200% keeps all controls usable (no fixed pixel traps; 44px
  targets hold).

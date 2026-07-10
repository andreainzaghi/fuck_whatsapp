# FUCK WHATSAPP — Design System

Single source of truth for the redesigned frontend. All tokens live as CSS
custom properties in [`packages/ui/tokens.css`](../packages/ui/tokens.css) and
are consumed via `var(--fw-*)`. No component hard-codes colours, spacing or
timings.

## Design direction

WhatsApp-familiar mental model · Swiss precision · premium minimalism ·
controlled brutalism · privacy-first. **Rebellion lives in the brand**
(onboarding, splash, empty states, About, security). **The daily chat is
quiet, clean, legible, distraction-free.**

## Brand

- Wordmark: `FUCK WHATSAPP`. Compact mark: `F/W` (an original slashed monogram —
  the slash reads as a *severed connection*, not the WhatsApp phone/bubble).
- Taglines: `Your messages. Your device. Nobody else.` /
  `No phone. No email. No central account. No Meta.`
- Voice snippets (brand surfaces only): *Fuck surveillance. · Your device is
  your account. · The relay moves ciphertext. Nothing more. · No ads. No
  tracking. No bullshit.*
- Never imitate WhatsApp's logo, green, phone glyph or speech bubble.

## Color tokens

Dark is the default; light is a full first-class theme. The theme is chosen by
`prefers-color-scheme` and can be overridden in Settings → Appearance
(`:root[data-theme="dark|light"]`).

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--fw-bg` | `#090909` | `#F5F5F2` | app background |
| `--fw-surface` | `#111111` | `#FFFFFF` | cards, sheets, bubbles-in |
| `--fw-surface-elevated` | `#181818` | `#ECECE8` | headers, composer, menus |
| `--fw-surface-hover` | `#1E1E1E` | `#E4E4DE` | row/button hover |
| `--fw-text-primary` | `#F5F5F5` | `#111111` | primary text |
| `--fw-text-secondary` | `#969696` | `#717171` | metadata, previews |
| `--fw-text-faint` | `#5E5E5E` | `#9A9A96` | timestamps, placeholders |
| `--fw-border` | `#272727` | `#DEDEDA` | hairlines, dividers |
| `--fw-accent` | `#B8FF3D` (acid green) | `#5B8A00` (accessible acid) | brand, primary CTA, active nav |
| `--fw-accent-ink` | `#0A0A0A` | `#FFFFFF` | text/icon on accent fill |
| `--fw-bubble-out` | `#17240A` | `#E4F7C4` | sent message bubble |
| `--fw-bubble-out-ink` | `#EAF7D4` | `#1B2A00` | sent bubble text |
| `--fw-danger` | `#FF5A5A` | `#D02525` | destructive, failed send |
| `--fw-security` | `#3DD7A6` | `#0F9D6B` | E2EE / cold-green security accent |

Acid green `#B8FF3D` is used as a **sharp accent**, not a flood: primary
buttons, the active nav item, focus rings, the recording dot, the F/W mark.
Sent bubbles use a dark acid-tinted surface with high-contrast ink (not a full
acid fill) so long conversations stay calm. Contrast: accent-ink on accent ≥ 12:1
(dark) / ≥ 4.6:1 (light); all body text ≥ 7:1 (dark) / ≥ 9:1 (light).

## Typography

System stack, no network fonts: `Inter, ui-sans-serif, -apple-system,
BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` (Inter is used when locally
present; otherwise the platform UI font — identical metrics-first fallback).

| Role | Size / weight / tracking |
|------|--------------------------|
| Brand splash | 40–56px / 800 / `-0.02em` |
| Wordmark (header) | 15px / 800 / `0.02em`, uppercase |
| Page title | 20px / 700 |
| Contact name | 16px / 600 |
| Message body | 15px / 400 / line-height 1.4 |
| Preview line | 14px / 400, secondary colour |
| Metadata / time | 12px / 500, faint colour |

User text size (Settings → Appearance) scales via `--fw-font-scale` on `:root`.

## Spacing, radius, elevation, motion

- Spacing: `--fw-sp-1..7` = 4 · 8 · 12 · 16 · 20 · 24 · 32 px.
- Radius: `--fw-radius-sm 8` · `-md 14` · `-lg 20` · `-xl 28` · `-full 999`.
- Shadows: `--fw-shadow-sheet`, `--fw-shadow-menu`, `--fw-shadow-fab` — soft,
  low-spread, theme-aware; no decorative gradients, no heavy blur.
- Z-index scale: `--fw-z-nav 10` · `-sticky 20` · `-fab 30` · `-sheet 40` ·
  `-modal 50` · `-toast 60`.
- Motion: `--fw-dur-fast 120ms` · `--fw-dur 180ms` · `--fw-dur-slow 220ms`;
  easing `--fw-ease` = `cubic-bezier(0.2,0,0,1)`. All motion is gated by
  `@media (prefers-reduced-motion: reduce)` → near-instant, no transforms.

## Touch, safe-area, breakpoints

- Min touch target `--fw-touch 44px` everywhere.
- Safe-area: `env(safe-area-inset-*)` on top bar, composer, tab bar, sheets.
- Breakpoints: mobile `< 900px` (single column + bottom tab bar); desktop
  `≥ 900px` (sidebar 320–400px + conversation, content max-width capped).

## Iconography

Original inline-SVG set ([`components/icons`](../apps/web/src/components/icons/index.tsx)):
1.75px stroke, 24px grid, `round` caps/joins, `currentColor`. Zero dependency,
zero remote assets, no emoji as system icons (emoji allowed inside message
content only). No WhatsApp-derived glyphs.

## Components

`AppShell · DesktopSidebar · MobileNavigation · BrandLogo · ChatList ·
ChatListItem · SearchBar · ConversationView · ConversationHeader ·
MessageTimeline · MessageBubble · MessageStatus · DateSeparator ·
MessageComposer · ReplyPreview · AttachmentSheet · AttachmentPreview ·
VoiceRecorder · AudioMessage · ImageMessage · VideoMessage · FileMessage ·
MediaViewer · InviteModal · QrScanner · RelayStatus · SecurityPanel ·
SettingsPage · Appearance · EmptyState · ErrorState · LoadingState/Skeleton ·
ToastProvider · ConfirmDialog · IconButton · Avatar`.

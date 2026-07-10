/**
 * FUCK WHATSAPP brand marks — original, purely typographic, monochrome.
 *
 * - <Mark/>: the F/W monogram. The slash reads as a *severed connection* — no
 *   phone glyph, no speech bubble, nothing derived from WhatsApp. Works down to
 *   24px and as a favicon-scale icon.
 * - <Wordmark/>: the stacked / inline "FUCK WHATSAPP" logotype.
 */
import styles from './logo.module.css';

export function Mark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="FUCK WHATSAPP"
      className={className}
      focusable="false"
    >
      <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="none" stroke="currentColor" strokeWidth="3" />
      {/* severed-connection slash */}
      <path d="M32 9 16 39" stroke="var(--fw-accent)" strokeWidth="3.5" strokeLinecap="round" />
      {/* F */}
      <path
        d="M12 14h9M12 14v20M12 23h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* W */}
      <path
        d="M27 15l3 19 3-11 3 11 3-19"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ stacked = false, className }: { stacked?: boolean; className?: string }) {
  return (
    <span className={`${styles['wordmark']} ${stacked ? styles['stacked'] : ''} ${className ?? ''}`}>
      <span className={styles['line']}>FUCK</span>
      <span className={styles['line']}>
        WHAT<span className={styles['accent']}>SAPP</span>
      </span>
    </span>
  );
}

/** Compact lockup: mark + inline wordmark, for headers/sidebars. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={`${styles['lockup']} ${className ?? ''}`}>
      <Mark size={26} />
      <span className={styles['lockupText']}>
        FUCK <span className={styles['accent']}>WHATSAPP</span>
      </span>
    </span>
  );
}

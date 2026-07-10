/**
 * Full-screen onboarding / unlock. Mode is decided by the session phase:
 *  - 'onboarding' (no profile on disk)  -> brand hero, then the create form
 *  - 'unlock'     (encrypted DB exists) -> brand-light password-only form
 */
import { useState } from 'react';
import { useSessionStore } from '../state/sessionStore';
import { Wordmark } from '../components/brand/Logo';
import CreateProfileForm from '../components/onboarding/CreateProfileForm';
import UnlockForm from '../components/onboarding/UnlockForm';
import styles from '../components/onboarding/onboarding.module.css';

/** The manifesto lines. The last one is accented for emphasis. */
const MANIFESTO: readonly { text: string; accent?: boolean }[] = [
  { text: 'No phone.' },
  { text: 'No email.' },
  { text: 'No central account.' },
  { text: 'No Meta.', accent: true },
];

function Hero({ onStart }: { onStart: () => void }) {
  return (
    <div className={`${styles.column} ${styles.hero}`}>
      <Wordmark stacked className={styles.heroWordmark} />

      <ul className={styles.manifesto}>
        {MANIFESTO.map((line) => (
          <li
            key={line.text}
            className={`${styles.manifestoLine} ${line.accent ? styles.accentLine : ''}`}
          >
            {line.text}
          </li>
        ))}
      </ul>

      <p className={styles.tagline}>Your device is your identity.</p>

      <button type="button" className={`btn btn-primary ${styles.heroCta}`} onClick={onStart}>
        Create identity
      </button>
    </div>
  );
}

export default function Onboarding() {
  const phase = useSessionStore((s) => s.phase);
  const [creating, setCreating] = useState(false);

  const showHero = phase === 'onboarding' && !creating;

  return (
    <div className={styles.screen}>
      {phase === 'unlock' ? (
        <div className={`${styles.column} ${styles.reveal}`}>
          <UnlockForm />
        </div>
      ) : showHero ? (
        <Hero onStart={() => setCreating(true)} />
      ) : (
        <div className={`${styles.column} ${styles.reveal}`}>
          <CreateProfileForm />
        </div>
      )}

      <footer className={styles.footer}>
        <p className={styles.footerLine}>No phone. No email. No central account.</p>
      </footer>
    </div>
  );
}

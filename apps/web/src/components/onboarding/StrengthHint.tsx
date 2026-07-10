/**
 * Live password strength hint — length + charset variety only. Purely local,
 * purely advisory; the hard rule (>= 12 chars) is enforced by the bridge too.
 */
import styles from './onboarding.module.css';

export const MIN_PASSWORD_LENGTH = 12;

export interface Strength {
  /** 0 = empty, 1..4 = weak..strong. */
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
}

export function passwordStrength(pw: string): Strength {
  if (pw.length === 0) return { level: 0, label: '' };
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { level: 1, label: `Too short — at least ${MIN_PASSWORD_LENGTH} characters (${pw.length}/${MIN_PASSWORD_LENGTH}).` };
  }
  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/[0-9]/.test(pw)) variety++;
  if (/[^A-Za-z0-9]/.test(pw)) variety++;

  let score = 1;
  if (pw.length >= 16) score++;
  if (pw.length >= 20) score++;
  if (variety >= 3) score++;
  const level = Math.min(4, score) as 1 | 2 | 3 | 4;
  const label =
    level === 1
      ? 'Weak — add length and mix character types.'
      : level === 2
        ? 'Fair — longer passphrases are stronger.'
        : level === 3
          ? 'Good.'
          : 'Strong.';
  return { level, label };
}

export default function StrengthHint({ password }: { password: string }) {
  const s = passwordStrength(password);
  if (s.level === 0) return null;
  const levelClass = [undefined, styles.level1, styles.level2, styles.level3, styles.level4][s.level];
  return (
    <div>
      <div className={`${styles.meter} ${levelClass ?? ''}`} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`${styles.seg} ${i <= s.level ? styles.segOn : ''}`} />
        ))}
      </div>
      <p className={styles.hint}>{s.label}</p>
    </div>
  );
}

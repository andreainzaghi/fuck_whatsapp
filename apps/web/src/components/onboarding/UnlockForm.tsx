/**
 * Unlock an existing encrypted profile. A wrong password comes back as a
 * sanitized code — shown inline, the field is cleared, nothing is logged.
 * Brand-light: a small wordmark, then a password-only form.
 */
import { useState, type FormEvent } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import Spinner from '../common/Spinner';
import { Wordmark } from '../brand/Logo';
import PasswordInput from './PasswordInput';
import { errorText } from './errors';
import styles from './onboarding.module.css';

export default function UnlockForm() {
  const unlock = useSessionStore((s) => s.unlock);
  const coreVersion = useSessionStore((s) => s.coreVersion);

  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  // The launcher may already have reported a failed attempt (core exited).
  const [error, setError] = useState<string | null>(() =>
    useSessionStore.getState().errorCode === 'wrong-password' ? 'wrong-password' : null,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy || pw.length === 0) return;
    setBusy(true);
    setError(null);
    const code = await unlock(pw);
    if (code !== null) {
      setError(code);
      if (code === 'wrong-password') setPw('');
      setBusy(false);
    }
    // On success the session phase flips (starting/ready) and this form unmounts.
  }

  return (
    <form className={styles.formShell} onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className={styles.formHeader}>
        <Wordmark />
        <h2 className={styles.formTitle}>Welcome back</h2>
        <p className={styles.formIntro}>
          Enter your database password to decrypt your profile on this device.
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="ul-pw">
          Database password
        </label>
        <PasswordInput
          id="ul-pw"
          value={pw}
          onChange={(v) => {
            setPw(v);
            setError(null);
          }}
          autoComplete="current-password"
          disabled={busy}
          autoFocus
          invalid={error === 'wrong-password'}
          describedBy={error !== null ? 'ul-err' : undefined}
        />
        {error !== null ? (
          <p className="error-text" id="ul-err" role="alert">
            {errorText(error)}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        className={`btn btn-primary ${styles.submitBtn}`}
        disabled={busy || pw.length === 0}
      >
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>

      <p className={styles.statusLine}>
        {busy ? <Spinner /> : <span className={styles.statusDot} aria-hidden="true" />}
        <span>
          SimpleX core — {busy ? 'starting' : 'locked'}
          {coreVersion ? ` (v${coreVersion})` : ''}
        </span>
      </p>
    </form>
  );
}

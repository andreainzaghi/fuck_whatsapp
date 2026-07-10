/**
 * First-run identity creation: display name + database password. The password
 * encrypts the local SQLCipher database from the very first byte and is
 * unrecoverable by design — the warning card makes that explicit.
 */
import { useState, type FormEvent } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import Spinner from '../common/Spinner';
import { AlertIcon } from '../icons';
import PasswordInput from './PasswordInput';
import StrengthHint, { MIN_PASSWORD_LENGTH } from './StrengthHint';
import { errorText } from './errors';
import styles from './onboarding.module.css';

/** Mirrors the bridge's display-name rules for instant feedback. */
function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Enter a display name.';
  if (trimmed.length > 50) return 'Keep it to 50 characters or fewer.';
  if (/^[/@#]/.test(trimmed)) return 'It cannot start with /, @ or #.';
  if (/[\p{Cc}\p{Cf}]/u.test(trimmed)) return 'It contains unsupported characters.';
  return null;
}

export default function CreateProfileForm() {
  const create = useSessionStore((s) => s.create);
  const coreVersion = useSessionStore((s) => s.coreVersion);

  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameError = nameTouched || name.length > 0 ? nameProblem(name) : null;
  const pwTooShort = pw.length > 0 && pw.length < MIN_PASSWORD_LENGTH;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const canSubmit =
    !busy && nameProblem(name) === null && pw.length >= MIN_PASSWORD_LENGTH && pw === pw2 && ack;

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const code = await create(name.trim(), pw);
    if (code !== null) {
      setError(code);
      setBusy(false);
    }
    // On success the session phase flips (starting/ready) and this form unmounts.
  }

  return (
    <form className={styles.formShell} onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className={styles.formHeader}>
        <h2 className={styles.formTitle}>Create your identity</h2>
        <p className={styles.formIntro}>
          Everything stays on this device, sealed inside a database only this password can open.
        </p>
      </div>

      <div className="field">
        <div className={styles.labelRow}>
          <label className="label" htmlFor="ob-name">
            Display name
          </label>
          <span className={styles.counter}>{name.trim().length}/50</span>
        </div>
        <input
          id="ob-name"
          className="input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onBlur={() => setNameTouched(true)}
          maxLength={60}
          autoComplete="off"
          autoFocus
          disabled={busy}
          spellCheck={false}
          placeholder="What your contacts will see"
          aria-invalid={nameError !== null || undefined}
          aria-describedby={nameError !== null ? 'ob-name-err' : undefined}
        />
        {nameError !== null ? (
          <p className="error-text" id="ob-name-err">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="ob-pw">
          Database password (min {MIN_PASSWORD_LENGTH} characters)
        </label>
        <PasswordInput
          id="ob-pw"
          value={pw}
          onChange={(v) => {
            setPw(v);
            setError(null);
          }}
          autoComplete="new-password"
          disabled={busy}
          invalid={pwTooShort}
          describedBy="ob-pw-hint"
        />
        <div id="ob-pw-hint">
          <StrengthHint password={pw} />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="ob-pw2">
          Confirm password
        </label>
        <PasswordInput
          id="ob-pw2"
          value={pw2}
          onChange={(v) => {
            setPw2(v);
            setError(null);
          }}
          autoComplete="new-password"
          disabled={busy}
          invalid={mismatch}
          describedBy={mismatch ? 'ob-pw2-err' : undefined}
        />
        {mismatch ? (
          <p className="error-text" id="ob-pw2-err">
            Passwords do not match.
          </p>
        ) : null}
      </div>

      <div className={styles.warnCard} role="note">
        <p className={styles.warnHead}>
          <AlertIcon size={16} aria-hidden="true" />
          <span className={styles.warnHeadText}>Read this</span>
        </p>
        <p className={styles.warnText}>
          The password stays on this device. It is never sent to anyone. If you lose it, it cannot be
          recovered.
        </p>
        <label className={styles.ackLabel}>
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            disabled={busy}
          />
          I understand
        </label>
      </div>

      {error !== null ? (
        <p className="error-text" role="alert">
          {errorText(error)}
        </p>
      ) : null}

      <button type="submit" className={`btn btn-primary ${styles.submitBtn}`} disabled={!canSubmit}>
        {busy ? 'Creating your identity…' : 'Create identity'}
      </button>

      <p className={styles.statusLine}>
        {busy ? <Spinner /> : <span className={styles.statusDot} aria-hidden="true" />}
        <span>
          SimpleX core — {busy ? 'starting' : 'waiting for your identity'}
          {coreVersion ? ` (v${coreVersion})` : ''}
        </span>
      </p>
    </form>
  );
}

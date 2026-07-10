/**
 * Password field with a show/hide toggle. The value is only ever rendered
 * inside this input — never echoed anywhere else in the UI or logs.
 */
import { useState } from 'react';
import styles from './onboarding.module.css';

export interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password' | 'current-password';
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}

export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  disabled,
  autoFocus,
  invalid,
  describedBy,
  placeholder,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.passwordWrap}>
      <input
        id={id}
        className={`input ${styles.passwordInput}`}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        maxLength={256}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        spellCheck={false}
        placeholder={placeholder}
      />
      <button
        type="button"
        className={styles.toggleBtn}
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        disabled={disabled}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

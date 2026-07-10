/**
 * Accessible confirm dialog: focus-trapped, Escape to cancel, backdrop click to
 * cancel, initial focus on the cancel (safe) action. Used for Danger Zone and
 * any destructive confirmation.
 */
import { useEffect, useRef } from 'react';
import styles from './primitives.module.css';

interface Props {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm(): void;
  onCancel(): void;
}

export default function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button');
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className={styles['scrim']} onClick={onCancel}>
      <div
        ref={dialogRef}
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className={styles['dialogTitle']}>
          {title}
        </h2>
        {body ? <p className={styles['dialogBody']}>{body}</p> : null}
        <div className={styles['dialogActions']}>
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn btn-danger-solid' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

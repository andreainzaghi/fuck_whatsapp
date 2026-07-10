/** Renders the toast queue from the UI store. Polite live region. */
import { useUiStore } from '../../state/uiStore';
import styles from './primitives.module.css';

export default function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className={styles['toastHost']} role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`${styles['toast']} ${styles[`toast-${t.tone}`]}`}
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

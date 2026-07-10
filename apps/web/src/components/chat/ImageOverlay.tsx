/**
 * Full-size image overlay. Click anywhere or press Escape to close.
 */
import { useEffect } from 'react';
import styles from './conversation.module.css';

export default function ImageOverlay({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles['overlay']}
      role="dialog"
      aria-modal="true"
      aria-label="Image"
      onClick={onClose}
    >
      <img className={styles['overlayImg']} src={src} alt="" />
      <button type="button" className={styles['overlayClose']} aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

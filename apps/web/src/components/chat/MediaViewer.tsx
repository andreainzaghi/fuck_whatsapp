/**
 * Full-screen media viewer for images and videos. Dark scrim, close/download
 * controls, tap-to-zoom (image), native controls (video). Closes on Escape and
 * backdrop click. Focus is moved to the close button on open and restored on
 * unmount. Renders no message content or filenames to the console.
 */
import { useEffect, useRef, useState } from 'react';
import { CloseIcon, DownloadIcon } from '../icons';
import { timeOfDay } from './format';
import styles from './conversation.module.css';

export interface MediaItem {
  kind: 'image' | 'video';
  /** Same-origin URL of the full-resolution bytes. */
  src: string;
  /** Sender label shown in the viewer bar. */
  name: string;
  /** ISO timestamp of the message. */
  ts: string;
  /** Suggested download filename. */
  downloadName?: string;
}

export default function MediaViewer({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<Element | null>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const prev = restoreRef.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [onClose]);

  return (
    <div
      className={styles['viewer']}
      role="dialog"
      aria-modal="true"
      aria-label={item.kind === 'video' ? 'Video' : 'Image'}
      onClick={onClose}
    >
      <div className={styles['viewerBar']} onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className={styles['viewerBtn']} aria-label="Close" onClick={onClose}>
          <CloseIcon size={20} />
        </button>
        <div className={styles['viewerMeta']}>
          <p className={styles['viewerName']}>{item.name}</p>
          <span className={styles['viewerTime']}>{timeOfDay(item.ts)}</span>
        </div>
        <a
          className={styles['viewerBtn']}
          href={item.src}
          download={item.downloadName ?? true}
          aria-label="Download"
        >
          <DownloadIcon size={20} />
        </a>
      </div>

      <div className={styles['viewerStage']} onClick={(e) => e.stopPropagation()}>
        {item.kind === 'video' ? (
          <video className={styles['viewerVideo']} src={item.src} controls autoPlay playsInline />
        ) : (
          <img
            className={`${styles['viewerImg']} ${zoom ? styles['viewerImgZoom'] : ''}`}
            src={item.src}
            alt=""
            onClick={() => setZoom((z) => !z)}
          />
        )}
      </div>
    </div>
  );
}

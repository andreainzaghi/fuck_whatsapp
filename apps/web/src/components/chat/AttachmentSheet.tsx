/**
 * Attachment picker — a richer secondary path to the composer's primary
 * "Attach a file" button. Bottom-sheet on touch/mobile, compact popover on
 * desktop. Each choice opens a filtered native <input type=file> and hands the
 * picked File back to the composer's single send pipeline. This never replaces
 * the primary direct filechooser button.
 */
import { useEffect, useRef, type ChangeEvent } from 'react';
import { ImageIcon, CameraIcon, VideoIcon, FileIcon } from '../icons';
import styles from './composer.module.css';

export interface AttachmentSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (file: File) => void;
}

export default function AttachmentSheet({ open, onClose, onPick }: AttachmentSheetProps) {
  const photoRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function pick(ref: React.RefObject<HTMLInputElement | null>): void {
    ref.current?.click();
  }

  function onChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      onPick(file);
      onClose();
    }
  }

  return (
    <>
      <div className={styles['sheetScrim']} onClick={onClose} aria-hidden="true" />
      <div className={styles['sheet']} role="menu" aria-label="Share an attachment">
        <div className={styles['sheetHandle']} aria-hidden="true" />
        <div className={styles['sheetGrid']}>
          <button type="button" className={styles['sheetItem']} role="menuitem" onClick={() => pick(photoRef)}>
            <span className={styles['sheetIcon']}>
              <ImageIcon size={22} />
            </span>
            Photo
          </button>
          <button type="button" className={styles['sheetItem']} role="menuitem" onClick={() => pick(cameraRef)}>
            <span className={styles['sheetIcon']}>
              <CameraIcon size={22} />
            </span>
            Camera
          </button>
          <button type="button" className={styles['sheetItem']} role="menuitem" onClick={() => pick(videoRef)}>
            <span className={styles['sheetIcon']}>
              <VideoIcon size={22} />
            </span>
            Video
          </button>
          <button type="button" className={styles['sheetItem']} role="menuitem" onClick={() => pick(fileRef)}>
            <span className={styles['sheetIcon']}>
              <FileIcon size={22} />
            </span>
            File
          </button>
        </div>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className={styles['hiddenInput']}
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles['hiddenInput']}
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        className={styles['hiddenInput']}
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={fileRef}
        type="file"
        accept="*/*"
        className={styles['hiddenInput']}
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
}

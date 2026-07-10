/**
 * Inline video message. Shows the inline poster preview with a play overlay and
 * opens the full-screen viewer (native controls) on tap once the file is local.
 * Received videos not yet downloaded show a Download affordance (acceptFile).
 */
import { useState } from 'react';
import { DownloadIcon, PlayIcon } from '../icons';
import { fileUrl } from '../../lib/bridgeClient';
import { useChatsStore, type Message } from '../../state/chatsStore';
import type { MediaItem } from './MediaViewer';
import styles from './message.module.css';

export default function VideoMessage({
  msg,
  senderName,
  onOpen,
}: {
  msg: Message;
  senderName: string;
  onOpen: (item: MediaItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const fullSrc = msg.filePath ? fileUrl(msg.filePath) : null;
  const preview = msg.imagePreview || null;
  const needsDownload = !fullSrc && msg.fileId != null;

  function open(): void {
    if (!fullSrc) return;
    onOpen({ kind: 'video', src: fullSrc, name: senderName, ts: msg.ts, downloadName: msg.fileName });
  }

  async function download(): Promise<void> {
    if (msg.fileId == null || busy) return;
    setBusy(true);
    try {
      await useChatsStore.getState().acceptFile(msg.fileId);
    } finally {
      setBusy(false);
    }
  }

  const poster = preview ? (
    <img className={`${styles['mediaImg']} ${styles['mediaImgBlur']}`} src={preview} alt="" />
  ) : (
    <span className={styles['mediaImg']} />
  );

  if (fullSrc) {
    return (
      <button type="button" className={styles['mediaFrame']} onClick={open} aria-label="Play video">
        {poster}
        <span className={styles['playOverlay']}>
          <span className={styles['playBadge']}>
            <PlayIcon size={24} />
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className={styles['mediaFrame']}>
      {poster}
      {needsDownload ? (
        <span className={styles['dlOverlay']}>
          <button type="button" className={styles['dlChip']} onClick={() => void download()} disabled={busy}>
            {busy ? <span className={styles['inlineSpinner']} /> : <DownloadIcon size={16} />}
            {busy ? 'Downloading' : 'Download video'}
          </button>
        </span>
      ) : (
        <span className={styles['playOverlay']}>
          <span className={styles['playBadge']}>
            <PlayIcon size={24} />
          </span>
        </span>
      )}
    </div>
  );
}

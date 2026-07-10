/**
 * Inline image message. Shows the tiny inline preview immediately (kept even
 * before download so the layout never jumps), swaps to full-resolution once the
 * file is on disk, and opens the full-screen viewer on tap. Received images that
 * are not yet downloaded show a Download affordance that calls acceptFile.
 */
import { useState } from 'react';
import { DownloadIcon } from '../icons';
import { fileUrl } from '../../lib/bridgeClient';
import { useChatsStore, type Message } from '../../state/chatsStore';
import type { MediaItem } from './MediaViewer';
import styles from './message.module.css';

export default function ImageMessage({
  msg,
  senderName,
  onOpen,
}: {
  msg: Message;
  senderName: string;
  onOpen: (item: MediaItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const preview = msg.imagePreview || null;
  // Prefer the full-resolution file; if it fails to load, fall back to the
  // inline preview so a received image is never blank.
  const fullSrc = msg.filePath && !fullFailed ? fileUrl(msg.filePath) : null;
  const displaySrc = fullSrc ?? preview;
  const needsDownload = !msg.filePath && msg.fileId != null;

  function open(): void {
    if (!fullSrc) return;
    onOpen({ kind: 'image', src: fullSrc, name: senderName, ts: msg.ts, downloadName: msg.fileName });
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

  const img = displaySrc ? (
    <img
      className={`${styles['mediaImg']} ${!fullSrc ? styles['mediaImgBlur'] : ''}`}
      src={displaySrc}
      alt=""
      onError={fullSrc ? () => setFullFailed(true) : undefined}
    />
  ) : (
    <span className={styles['mediaImg']} />
  );

  if (fullSrc) {
    return (
      <button type="button" className={styles['mediaFrame']} onClick={open} aria-label="Open image">
        {img}
      </button>
    );
  }

  return (
    <div className={styles['mediaFrame']}>
      {img}
      {needsDownload ? (
        <span className={styles['dlOverlay']}>
          <button type="button" className={styles['dlChip']} onClick={() => void download()} disabled={busy}>
            {busy ? <span className={styles['inlineSpinner']} /> : <DownloadIcon size={16} />}
            {busy ? 'Downloading' : 'Download'}
          </button>
        </span>
      ) : null}
    </div>
  );
}

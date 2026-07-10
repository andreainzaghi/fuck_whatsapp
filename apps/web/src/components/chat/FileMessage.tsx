/**
 * Generic file attachment card: icon, name, humanized size, and a download /
 * open action. When the file is local it is a same-origin download link; when a
 * received file is not downloaded yet it triggers acceptFile.
 */
import { useState } from 'react';
import { DownloadIcon, FileIcon } from '../icons';
import { fileUrl } from '../../lib/bridgeClient';
import { useChatsStore, type Message } from '../../state/chatsStore';
import { humanSize } from './format';
import styles from './message.module.css';

export default function FileMessage({ msg }: { msg: Message }) {
  const [busy, setBusy] = useState(false);
  const name = msg.fileName ?? 'File';
  const size = humanSize(msg.fileSize);
  const local = msg.filePath ? fileUrl(msg.filePath) : null;
  const needsDownload = !local && msg.fileId != null;

  async function download(): Promise<void> {
    if (msg.fileId == null || busy) return;
    setBusy(true);
    try {
      await useChatsStore.getState().acceptFile(msg.fileId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles['fileCard']}>
      <span className={styles['fileIcon']} aria-hidden="true">
        <FileIcon size={20} />
      </span>
      <span className={styles['fileInfo']}>
        <span className={styles['fileName']} title={name}>
          {name}
        </span>
        {size ? <span className={styles['fileSize']}>{size}</span> : null}
      </span>
      {local ? (
        <a className={styles['fileAction']} href={local} download={name} aria-label={`Download ${name}`}>
          <DownloadIcon size={18} />
        </a>
      ) : needsDownload ? (
        <button
          type="button"
          className={styles['fileAction']}
          onClick={() => void download()}
          disabled={busy}
          aria-label={`Download ${name}`}
        >
          {busy ? <span className={styles['inlineSpinner']} /> : <DownloadIcon size={18} />}
        </button>
      ) : null}
    </div>
  );
}

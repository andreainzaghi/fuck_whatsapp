/**
 * Row pointing at a document in the repository — rendered as plain text on
 * purpose: the app never links out and the docs live on disk.
 */
import { FileIcon } from '../icons';
import styles from './settings.module.css';

export default function DocRow({ title, path }: { title: string; path: string }) {
  return (
    <div className={styles.docRow}>
      <span className={styles.docIcon} aria-hidden="true">
        <FileIcon size={18} />
      </span>
      <span className={styles.docText}>
        <span className={styles.docTitle}>{title}</span>
        <span className={styles.docPath}>{path}</span>
      </span>
    </div>
  );
}

/** Label / value row for the Settings sections. */
import styles from './settings.module.css';

export interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

export default function InfoRow({ label, value, mono = false }: InfoRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={mono ? `${styles.rowValue} ${styles.mono}` : styles.rowValue}>{value}</span>
    </div>
  );
}

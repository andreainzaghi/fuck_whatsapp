/** Centered day separator chip (Today / Yesterday / DD MMM). */
import { dayLabel } from './format';
import styles from './conversation.module.css';

export default function DateSeparator({ iso }: { iso: string }) {
  return <div className={styles['daySep']}>{dayLabel(iso)}</div>;
}

/**
 * Placeholder rows shown while the first chat load is in flight. No data,
 * no logging — just shimmer blocks matching the real row rhythm.
 */
import styles from './chatList.module.css';

export default function ChatListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className={styles['skelList']} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className={styles['skelRow']}>
          <span className={`skeleton ${styles['skelAvatar']}`} />
          <span className={styles['skelLines']}>
            <span className={`skeleton ${styles['skelLineTop']}`} />
            <span className={`skeleton ${styles['skelLineBottom']}`} />
          </span>
        </li>
      ))}
    </ul>
  );
}

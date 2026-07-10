/**
 * One relay server row: monospace URI (middle-truncated, tap to expand) with
 * preset / enabled / onion badges. Renders ONLY what the core returned — no
 * address is ever invented client-side.
 */
import { useState } from 'react';
import type { NetworkServer } from '../../state/networkStore';
import styles from './network.module.css';

const HEAD = 30;
const TAIL = 18;

function truncateMiddle(s: string): string {
  if (s.length <= HEAD + TAIL + 1) return s;
  return `${s.slice(0, HEAD)}…${s.slice(-TAIL)}`;
}

export default function ServerRow({ server }: { server: NetworkServer }) {
  const [expanded, setExpanded] = useState(false);
  const isOnion = server.server.includes('.onion');
  return (
    <li className={styles.serverItem}>
      <button
        type="button"
        className={styles.serverRow}
        aria-expanded={expanded}
        title={expanded ? 'Tap to collapse' : 'Tap to show full address'}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={expanded ? `${styles.uri} ${styles.uriFull}` : styles.uri}>
          {expanded ? server.server : truncateMiddle(server.server)}
        </span>
        <span className={styles.badges}>
          {server.preset ? <span className={styles.miniBadge}>preset</span> : null}
          <span
            className={`${styles.miniBadge} ${server.enabled ? styles.badgeOn : styles.badgeOff}`}
          >
            <span className={styles.badgeDot} aria-hidden="true" />
            {server.enabled ? 'enabled' : 'disabled'}
          </span>
          {isOnion ? (
            <span className={`${styles.miniBadge} ${styles.badgeOnion}`}>onion host</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

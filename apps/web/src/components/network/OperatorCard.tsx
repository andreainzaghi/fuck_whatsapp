/**
 * One server operator: name, enabled state, roles, and its SMP/XFTP relays.
 * Everything shown here comes from the core — nothing is invented.
 */
import type { NetworkOperator } from '../../state/networkStore';
import ServerRow from './ServerRow';
import styles from './network.module.css';

export interface OperatorCardProps {
  op: NetworkOperator;
  /** Roles line derived from the raw config, or null when unknown. */
  roles: string | null;
}

export default function OperatorCard({ op, roles }: OperatorCardProps) {
  const roleChips = roles ? roles.split(' · ').filter(Boolean) : [];
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.opName}>{op.name}</span>
        <span
          className={`${styles.miniBadge} ${op.enabled ? styles.badgeOn : styles.badgeOff}`}
        >
          <span className={styles.badgeDot} aria-hidden="true" />
          {op.enabled ? 'enabled' : 'disabled'}
        </span>
      </div>

      {roleChips.length > 0 ? (
        <div className={styles.roleChips}>
          {roleChips.map((r) => (
            <span key={r} className={styles.roleChip}>
              {r}
            </span>
          ))}
        </div>
      ) : null}

      {op.smp.length > 0 ? (
        <>
          <h3 className={styles.groupTitle}>Message relays (SMP)</h3>
          <ul className={styles.serverList}>
            {op.smp.map((s) => (
              <ServerRow key={s.server} server={s} />
            ))}
          </ul>
        </>
      ) : null}

      {op.xftp.length > 0 ? (
        <>
          <h3 className={styles.groupTitle}>File relays (XFTP)</h3>
          <ul className={styles.serverList}>
            {op.xftp.map((s) => (
              <ServerRow key={s.server} server={s} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** Titled card container used for each Settings section. */
import type { ReactNode } from 'react';
import styles from './settings.module.css';

export interface SectionCardProps {
  title: string;
  /** Optional leading icon rendered next to the title. */
  icon?: ReactNode;
  /** Danger styling for destructive sections. */
  tone?: 'default' | 'danger';
  children: ReactNode;
}

export default function SectionCard({ title, icon, tone = 'default', children }: SectionCardProps) {
  const danger = tone === 'danger';
  return (
    <section className={danger ? `${styles.card} ${styles.cardDanger}` : styles.card}>
      <div className={styles.cardHead}>
        {icon ? (
          <span
            className={danger ? `${styles.cardIcon} ${styles.cardIconDanger}` : styles.cardIcon}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <h2 className={danger ? `${styles.cardTitle} ${styles.cardTitleDanger}` : styles.cardTitle}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

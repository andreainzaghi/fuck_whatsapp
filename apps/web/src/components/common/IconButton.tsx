/** Square, 44px, accessible icon button. `label` becomes aria-label + title. */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './primitives.module.css';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string;
  children: ReactNode;
  tone?: 'default' | 'accent' | 'danger';
  size?: 'md' | 'lg';
}

export default function IconButton({ label, children, tone = 'default', size = 'md', className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`${styles['iconBtn']} ${styles[`tone-${tone}`]} ${styles[`size-${size}`]} ${className ?? ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

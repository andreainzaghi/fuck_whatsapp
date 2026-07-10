/**
 * Deterministic initials avatar. No remote images. The hue is derived from the
 * name so a contact keeps a stable colour, tinted onto the acid-accent family.
 */
import { useMemo } from 'react';
import styles from './primitives.module.css';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const hue = useMemo(() => hueFor(name), [name]);
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.38),
    background: `hsl(${hue} 46% 22%)`,
    color: `hsl(${hue} 80% 78%)`,
  } as const;
  return (
    <span className={styles['avatar']} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

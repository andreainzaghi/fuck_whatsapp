/**
 * Appearance controls: theme (System / Light / Dark) and text size
 * (Small / Default / Large). Reads and writes the UI store, which persists to
 * IndexedDB and applies the change to the document root immediately.
 */
import { useUiStore } from '../../state/uiStore';
import type { TextSizePref, ThemePref } from '../../lib/prefs';
import { MoonIcon, SunIcon } from '../icons';
import styles from './settings.module.css';

const THEMES: { value: ThemePref; label: string; icon?: 'sun' | 'moon' }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

const SIZES: { value: TextSizePref; label: string; scale: number }[] = [
  { value: 'small', label: 'Small', scale: 0.86 },
  { value: 'default', label: 'Default', scale: 1 },
  { value: 'large', label: 'Large', scale: 1.16 },
];

export default function Appearance() {
  const theme = useUiStore((s) => s.prefs.theme);
  const textSize = useUiStore((s) => s.prefs.textSize);
  const setTheme = useUiStore((s) => s.setTheme);
  const setTextSize = useUiStore((s) => s.setTextSize);

  return (
    <>
      <div className={styles.settingBlock}>
        <span className={styles.settingLabel} id="theme-label">
          Theme
        </span>
        <div className={styles.segmented} role="group" aria-labelledby="theme-label">
          {THEMES.map((t) => {
            const active = theme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                className={active ? `${styles.segment} ${styles.segmentActive}` : styles.segment}
                aria-pressed={active}
                onClick={() => setTheme(t.value)}
              >
                {t.icon === 'sun' ? <SunIcon size={16} aria-hidden="true" /> : null}
                {t.icon === 'moon' ? <MoonIcon size={16} aria-hidden="true" /> : null}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.settingBlock}>
        <span className={styles.settingLabel} id="textsize-label">
          Text size
        </span>
        <div className={styles.segmented} role="group" aria-labelledby="textsize-label">
          {SIZES.map((s) => {
            const active = textSize === s.value;
            return (
              <button
                key={s.value}
                type="button"
                className={active ? `${styles.segment} ${styles.segmentActive}` : styles.segment}
                aria-pressed={active}
                onClick={() => setTextSize(s.value)}
              >
                <span className={styles.segmentA} style={{ fontSize: `${s.scale}em` }} aria-hidden="true">
                  A
                </span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

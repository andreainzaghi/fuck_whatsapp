/**
 * Tiny IndexedDB key/value store for NON-SENSITIVE UI preferences only
 * (theme, text size, reduced-motion override). Never chat content, never keys,
 * never tokens. IndexedDB — not localStorage — per the project storage rule
 * (localStorage/sessionStorage writes are forbidden and enforced by
 * scripts/security-check.mjs).
 */

const DB_NAME = 'fwa-ui';
const STORE = 'prefs';

export type ThemePref = 'system' | 'light' | 'dark';
export type TextSizePref = 'small' | 'default' | 'large';

export interface UiPrefs {
  theme: ThemePref;
  textSize: TextSizePref;
}

export const DEFAULT_PREFS: UiPrefs = { theme: 'system', textSize: 'default' };

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function loadPrefs(): Promise<UiPrefs> {
  const db = await openDb();
  if (!db) return { ...DEFAULT_PREFS };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get('ui');
      req.onsuccess = () => resolve({ ...DEFAULT_PREFS, ...(req.result as Partial<UiPrefs> | undefined) });
      req.onerror = () => resolve({ ...DEFAULT_PREFS });
    } catch {
      resolve({ ...DEFAULT_PREFS });
    } finally {
      db.close();
    }
  });
}

export async function savePrefs(prefs: UiPrefs): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(prefs, 'ui');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

const TEXT_SCALE: Record<TextSizePref, string> = { small: '0.92', default: '1', large: '1.12' };

/** Apply prefs to the document root (data-theme + --fw-font-scale). */
export function applyPrefs(prefs: UiPrefs): void {
  const root = document.documentElement;
  if (prefs.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
  root.style.setProperty('--fw-font-scale', TEXT_SCALE[prefs.textSize]);
}

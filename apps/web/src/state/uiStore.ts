/**
 * UI-only store: theme/appearance preferences (persisted to IndexedDB) and the
 * transient toast queue. No chat data, no security state.
 */
import { create } from 'zustand';
import { applyPrefs, DEFAULT_PREFS, loadPrefs, savePrefs, type TextSizePref, type ThemePref, type UiPrefs } from '../lib/prefs';

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'success' | 'danger';
}

export interface UiState {
  prefs: UiPrefs;
  prefsLoaded: boolean;
  toasts: Toast[];
  initPrefs(): Promise<void>;
  setTheme(theme: ThemePref): void;
  setTextSize(size: TextSizePref): void;
  toast(message: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set, get) => ({
  prefs: { ...DEFAULT_PREFS },
  prefsLoaded: false,
  toasts: [],

  async initPrefs() {
    const prefs = await loadPrefs();
    applyPrefs(prefs);
    set({ prefs, prefsLoaded: true });
  },

  setTheme(theme) {
    const prefs = { ...get().prefs, theme };
    applyPrefs(prefs);
    set({ prefs });
    void savePrefs(prefs);
  },

  setTextSize(textSize) {
    const prefs = { ...get().prefs, textSize };
    applyPrefs(prefs);
    set({ prefs });
    void savePrefs(prefs);
  },

  toast(message, tone = 'default') {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    window.setTimeout(() => get().dismissToast(id), 3800);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

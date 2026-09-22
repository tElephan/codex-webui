/**
 * Shared theme state — single source of truth for dark mode.
 * Persisted to localStorage via Zustand persist middleware.
 * Stores the preference separately from the resolved color scheme.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const STORAGE_KEY = 'codex.webui.theme';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

export type ThemeMode = 'system' | 'light' | 'dark';

function getSystemPrefersDark(): boolean {
  return systemTheme.matches;
}

function applyDarkClass(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#17191f' : '#f7f8fa');
}

/**
 * Migrate legacy plain-string storage (`"dark"` / `"light"`) to
 * Zustand persist JSON format. Must run before store creation.
 */
function migrateLegacyStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ state: { dark: raw === 'dark' }, version: 0 }),
      );
    }
  } catch {
    // Storage unavailable — skip silently.
  }
}

migrateLegacyStorage();

interface ThemeState {
  mode: ThemeMode;
  dark: boolean;
  setMode: (mode: ThemeMode) => void;
  setDark: (dark: boolean) => void;
  toggleDark: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      dark: getSystemPrefersDark(),

      setMode: (mode) => {
        const dark = mode === 'system' ? getSystemPrefersDark() : mode === 'dark';
        applyDarkClass(dark);
        set({ mode, dark });
      },

      setDark: (dark) => get().setMode(dark ? 'dark' : 'light'),
      toggleDark: () => get().setDark(!get().dark),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ mode: state.mode }),
      merge: (persisted, current) => {
        const saved = persisted as { mode?: unknown; dark?: unknown } | null;
        const mode: ThemeMode =
          saved?.mode === 'system' || saved?.mode === 'light' || saved?.mode === 'dark'
            ? saved.mode
            : typeof saved?.dark === 'boolean'
              ? saved.dark ? 'dark' : 'light'
              : 'system';
        return {
          ...current,
          mode,
          dark: mode === 'system' ? getSystemPrefersDark() : mode === 'dark',
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) applyDarkClass(state.dark);
      },
    },
  ),
);

// Apply initial theme immediately (before rehydration completes)
applyDarkClass(useThemeStore.getState().dark);

// System changes only affect users who explicitly follow the system.
function handleSystemThemeChange() {
  if (useThemeStore.getState().mode !== 'system') return;
  const dark = getSystemPrefersDark();
  applyDarkClass(dark);
  useThemeStore.setState({ dark });
}

systemTheme.addEventListener('change', handleSystemThemeChange);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    systemTheme.removeEventListener('change', handleSystemThemeChange);
  });
}

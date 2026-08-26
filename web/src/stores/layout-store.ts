/**
 * Layout & sidebar UI state store.
 * Manages responsive layout behavior (sidebar visibility, collapse state)
 * and sidebar navigation state (view mode, collapsed groups).
 *
 * Persisted fields (localStorage via Zustand persist):
 *   - desktopSidebarCollapsed: whether desktop sidebar is manually collapsed
 *   - desktopSidebarSize: desktop sidebar width as a percentage of the app shell
 *   - sessionFileTreeSize: session panel file tree width as a percentage
 *   - collapsedGroupKeys: workspace group collapse preferences
 *
 * Runtime-only fields (reset on refresh):
 *   - sidebarOpen: mobile/tablet Sheet open state
 *   - sidebarView: current sidebar navigation view (overview / detail)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Sidebar view types ───────────────────────────────────────────────

export type SidebarViewState =
  | { type: 'overview' }
  | { type: 'workspaceDetail'; cwd: string }
  | { type: 'archivedDetail' };

const DESKTOP_SIDEBAR_MIN = 12;
const DESKTOP_SIDEBAR_MAX = 40;
const SESSION_FILE_TREE_MIN = 16;
const SESSION_FILE_TREE_MAX = 45;

function clampSize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

// ── Store interface ──────────────────────────────────────────────────

interface LayoutState {
  // ── Persisted ──────────────────────────────────────────────────────
  /** Whether the desktop sidebar is manually collapsed. */
  desktopSidebarCollapsed: boolean;
  /** Desktop sidebar width as a percentage of the app shell. */
  desktopSidebarSize: number;
  /** Session panel file tree width as a percentage of the panel. */
  sessionFileTreeSize: number;
  /** Workspace group keys that are collapsed in the sidebar thread list. */
  collapsedGroupKeys: string[];

  // ── Runtime only ───────────────────────────────────────────────────
  /** Whether the mobile/tablet sidebar Sheet is open. */
  sidebarOpen: boolean;
  /** Current sidebar navigation view. Resets to overview on refresh. */
  sidebarView: SidebarViewState;

  // ── Actions ────────────────────────────────────────────────────────
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarOpen: () => void;
  setDesktopSidebarCollapsed: (collapsed: boolean) => void;
  toggleDesktopSidebarCollapsed: () => void;
  setDesktopSidebarSize: (size: number) => void;
  setSessionFileTreeSize: (size: number) => void;
  setSidebarView: (view: SidebarViewState) => void;
  /** Toggle a workspace group's collapsed state. */
  toggleCollapsedGroup: (key: string) => void;
  /** Check if a workspace group is collapsed. */
  isGroupCollapsed: (key: string) => boolean;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      // ── Persisted defaults ───────────────────────────────────────────
      desktopSidebarCollapsed: false,
      desktopSidebarSize: 20,
      sessionFileTreeSize: 22,
      collapsedGroupKeys: [],

      // ── Runtime defaults ─────────────────────────────────────────────
      sidebarOpen: false,
      sidebarView: { type: 'overview' },

      // ── Actions ──────────────────────────────────────────────────────
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebarOpen: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      setDesktopSidebarCollapsed: (collapsed) =>
        set({ desktopSidebarCollapsed: collapsed }),
      toggleDesktopSidebarCollapsed: () =>
        set((s) => ({ desktopSidebarCollapsed: !s.desktopSidebarCollapsed })),
      setDesktopSidebarSize: (size) =>
        set({
          desktopSidebarSize: clampSize(
            size,
            DESKTOP_SIDEBAR_MIN,
            DESKTOP_SIDEBAR_MAX,
          ),
        }),
      setSessionFileTreeSize: (size) =>
        set({
          sessionFileTreeSize: clampSize(
            size,
            SESSION_FILE_TREE_MIN,
            SESSION_FILE_TREE_MAX,
          ),
        }),

      setSidebarView: (view) => set({ sidebarView: view }),

      toggleCollapsedGroup: (key) =>
        set((s) => {
          const keys = s.collapsedGroupKeys;
          return {
            collapsedGroupKeys: keys.includes(key)
              ? keys.filter((k) => k !== key)
              : [...keys, key],
          };
        }),

      isGroupCollapsed: (key) => get().collapsedGroupKeys.includes(key),
    }),
    {
      name: 'codex.webui.layout',
      partialize: (state) => ({
        desktopSidebarCollapsed: state.desktopSidebarCollapsed,
        desktopSidebarSize: state.desktopSidebarSize,
        sessionFileTreeSize: state.sessionFileTreeSize,
        collapsedGroupKeys: state.collapsedGroupKeys,
      }),
    },
  ),
);

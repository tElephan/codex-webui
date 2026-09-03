/**
 * Zustand store for file browser UI state only.
 * REST data (tree, content, metadata) is managed by TanStack Query.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type FilesContext = 'none' | 'window' | 'thread';

export interface FileEditState {
  content: string;
  expectedMtime: number | null;
}

interface FilesState {
  /** Current root directory (from thread cwd or home). */
  rootDir: string | null;
  /** Most recent directory whose listing loaded successfully. */
  lastValidRootDir: string | null;
  /** Currently selected file path. */
  selectedFile: string | null;
  /** Whether the file panel is visible. */
  panelOpen: boolean;
  /** Expanded directory paths for tree state. */
  expandedDirs: Set<string>;
  /** Mtime of currently open file (for conflict detection). */
  fileMtime: number | null;
  /** Currently active consumer of the shared file browser state. */
  activeContext: FilesContext;
  /** File-window state kept while the window is hidden. */
  windowRootDir: string | null;
  windowLastValidRootDir: string | null;
  windowSelectedFile: string | null;
  windowFileTabs: string[];
  /** Unsaved editor content, keyed by absolute file path. */
  fileEdits: Record<string, FileEditState>;
  hydrated: boolean;

  setRootDir: (dir: string | null) => void;
  markRootDirValid: (dir: string) => void;
  restoreLastValidRootDir: (failedDir: string) => void;
  selectFile: (filePath: string | null) => void;
  selectFileForWindow: (filePath: string) => void;
  closeFileForWindow: (filePath: string) => void;
  setFileEdit: (
    filePath: string,
    content: string,
    persistedContent: string,
    expectedMtime: number | null,
  ) => void;
  markFileSaved: (
    filePath: string,
    savedContent: string,
    mtime: number,
  ) => void;
  discardFileEdit: (filePath: string) => void;
  activateContext: (context: FilesContext, defaultRoot?: string | null) => void;
  setHydrated: (hydrated: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  toggleDirectory: (dirPath: string) => void;
  setFileMtime: (mtime: number | null) => void;
  navigateUp: () => void;
}

const STORAGE_KEY = 'codex-webui.files.v1';

export const useFilesStore = create<FilesState>()(
  persist(
    (set, get) => ({
      rootDir: null,
      lastValidRootDir: null,
      selectedFile: null,
      panelOpen: false,
      expandedDirs: new Set<string>(),
      fileMtime: null,
      activeContext: 'none',
      windowRootDir: null,
      windowLastValidRootDir: null,
      windowSelectedFile: null,
      windowFileTabs: [],
      fileEdits: {},
      hydrated: false,

      setRootDir: (dir: string | null) => {
        if (dir === get().rootDir) return;
        const selectedFile = get().selectedFile;
        const keepSelectedFile = Boolean(
          dir &&
          selectedFile &&
          (selectedFile === dir || selectedFile.startsWith(`${dir}/`)),
        );
        const next = {
          rootDir: dir,
          selectedFile: keepSelectedFile ? selectedFile : null,
          expandedDirs: new Set<string>(),
          fileMtime: keepSelectedFile ? get().fileMtime : null,
        };
        set(
          get().activeContext === 'window'
            ? {
                ...next,
                windowRootDir: dir,
                windowSelectedFile: next.selectedFile,
              }
            : next,
        );
      },

      markRootDirValid: (dir: string) => {
        set((state) => {
          if (state.rootDir !== dir || state.lastValidRootDir === dir)
            return state;
          return state.activeContext === 'window'
            ? { lastValidRootDir: dir, windowLastValidRootDir: dir }
            : { lastValidRootDir: dir };
        });
      },

      restoreLastValidRootDir: (failedDir: string) => {
        set((state) => {
          const fallback = state.lastValidRootDir;
          if (
            state.rootDir !== failedDir ||
            !fallback ||
            fallback === failedDir
          ) {
            return state;
          }
          const keepSelectedFile = Boolean(
            state.selectedFile &&
            (state.selectedFile === fallback ||
              state.selectedFile.startsWith(`${fallback}/`)),
          );
          const next = {
            rootDir: fallback,
            selectedFile: keepSelectedFile ? state.selectedFile : null,
            expandedDirs: new Set<string>(),
            fileMtime: keepSelectedFile ? state.fileMtime : null,
          };
          return state.activeContext === 'window'
            ? {
                ...next,
                windowRootDir: fallback,
                windowSelectedFile: next.selectedFile,
              }
            : next;
        });
      },

      selectFile: (filePath: string | null) => {
        const next = {
          selectedFile: filePath,
          panelOpen: filePath !== null,
          fileMtime: null,
        };
        set(
          get().activeContext === 'window'
            ? { ...next, windowSelectedFile: filePath }
            : next,
        );
      },

      selectFileForWindow: (filePath: string) => {
        set((state) => ({
          windowSelectedFile: filePath,
          windowFileTabs: state.windowFileTabs.includes(filePath)
            ? state.windowFileTabs
            : [...state.windowFileTabs, filePath],
          ...(state.activeContext === 'window'
            ? { selectedFile: filePath, panelOpen: true, fileMtime: null }
            : {}),
        }));
      },

      closeFileForWindow: (filePath: string) => {
        set((state) => {
          const closedIndex = state.windowFileTabs.indexOf(filePath);
          const windowFileTabs = state.windowFileTabs.filter(
            (path) => path !== filePath,
          );
          const nextSelected =
            state.windowSelectedFile === filePath
              ? (windowFileTabs[
                  Math.min(closedIndex, windowFileTabs.length - 1)
                ] ?? null)
              : state.windowSelectedFile;
          return {
            windowFileTabs,
            windowSelectedFile: nextSelected,
            ...(state.activeContext === 'window'
              ? { selectedFile: nextSelected, fileMtime: null }
              : {}),
          };
        });
      },

      setFileEdit: (filePath, content, persistedContent, expectedMtime) => {
        set((state) => {
          const fileEdits = { ...state.fileEdits };
          if (content === persistedContent) {
            if (!(filePath in fileEdits)) return state;
            delete fileEdits[filePath];
          } else {
            fileEdits[filePath] = {
              content,
              expectedMtime:
                state.fileEdits[filePath]?.expectedMtime ?? expectedMtime,
            };
          }
          return { fileEdits };
        });
      },

      markFileSaved: (filePath, savedContent, mtime) => {
        set((state) => {
          const currentEdit = state.fileEdits[filePath];
          if (!currentEdit) return state;
          const fileEdits = { ...state.fileEdits };
          if (currentEdit.content === savedContent) {
            delete fileEdits[filePath];
          } else {
            fileEdits[filePath] = { ...currentEdit, expectedMtime: mtime };
          }
          return { fileEdits };
        });
      },

      discardFileEdit: (filePath) => {
        set((state) => {
          if (!(filePath in state.fileEdits)) return state;
          const fileEdits = { ...state.fileEdits };
          delete fileEdits[filePath];
          return { fileEdits };
        });
      },

      activateContext: (context: FilesContext, defaultRoot = null) => {
        const state = get();
        if (context === 'window') {
          const lastValidRootDir = state.windowLastValidRootDir ?? defaultRoot;
          set({
            activeContext: context,
            rootDir: state.windowRootDir ?? defaultRoot,
            lastValidRootDir,
            windowLastValidRootDir: lastValidRootDir,
            selectedFile: state.windowSelectedFile,
            fileMtime: null,
            expandedDirs: new Set<string>(),
          });
          return;
        }

        if (context === 'thread') {
          const selectedFile = state.selectedFile;
          const keepSelectedFile = Boolean(
            defaultRoot &&
            selectedFile &&
            (selectedFile === defaultRoot ||
              selectedFile.startsWith(`${defaultRoot}/`)),
          );
          set({
            activeContext: context,
            rootDir: defaultRoot,
            lastValidRootDir: defaultRoot,
            selectedFile: keepSelectedFile ? selectedFile : null,
            fileMtime: keepSelectedFile ? state.fileMtime : null,
            expandedDirs: new Set<string>(),
          });
          return;
        }

        set({ activeContext: context });
      },

      setPanelOpen: (open: boolean) => set({ panelOpen: open }),

      setHydrated: (hydrated: boolean) => set({ hydrated }),

      toggleDirectory: (dirPath: string) => {
        set((s) => {
          const next = new Set(s.expandedDirs);
          if (next.has(dirPath)) {
            next.delete(dirPath);
          } else {
            next.add(dirPath);
          }
          return { expandedDirs: next };
        });
      },

      setFileMtime: (mtime: number | null) => set({ fileMtime: mtime }),

      navigateUp: () => {
        const { rootDir } = get();
        if (!rootDir || rootDir === '/') return;
        const parent = rootDir.substring(0, rootDir.lastIndexOf('/')) || '/';
        get().setRootDir(parent);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      // The active thread file state is tied to the current route/cwd. Keep the
      // independent global Files window state across a browser refresh instead.
      partialize: (state) => ({
        windowRootDir: state.windowRootDir,
        windowLastValidRootDir: state.windowLastValidRootDir,
        windowSelectedFile: state.windowSelectedFile,
        windowFileTabs: state.windowFileTabs,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

import { create } from 'zustand';

export type ThreadSyncStatus = 'syncing' | 'pending' | 'error' | 'idle';

export const useThreadSyncStore = create<{
  threads: Record<string, { status: ThreadSyncStatus; checkedAt: number }>;
  setStatus: (threadId: string, status: ThreadSyncStatus) => void;
}>((set) => ({
  threads: {},
  setStatus: (threadId, status) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [threadId]: { status, checkedAt: Date.now() },
      },
    })),
}));

import { create } from 'zustand';
import { useConnectionStore } from './connection-store';

export type ThreadSyncStatus = 'syncing' | 'pending' | 'error' | 'idle';

export const useThreadSyncStore = create<{
  threads: Record<string, { status: ThreadSyncStatus; checkedAt: number; connectionEpoch: number }>;
  setStatus: (threadId: string, status: ThreadSyncStatus, connectionEpoch?: number) => void;
}>((set) => ({
  threads: {},
  setStatus: (threadId, status, connectionEpoch = useConnectionStore.getState().epoch) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [threadId]: { status, checkedAt: Date.now(), connectionEpoch },
      },
    })),
}));

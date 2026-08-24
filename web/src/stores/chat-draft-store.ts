/** Per-thread chat drafts kept for the lifetime of the browser tab. */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type DraftUpdate = string | ((current: string) => string);

interface ChatDraftState {
  drafts: Record<string, string>;
  setDraft: (threadId: string, update: DraftUpdate) => void;
}

export const useChatDraftStore = create<ChatDraftState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (threadId, update) => {
        set((state) => {
          const current = state.drafts[threadId] ?? '';
          const next = typeof update === 'function' ? update(current) : update;
          const drafts = { ...state.drafts };
          if (next) drafts[threadId] = next;
          else delete drafts[threadId];
          return { drafts };
        });
      },
    }),
    {
      name: 'codex.webui.chat-drafts.v1',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

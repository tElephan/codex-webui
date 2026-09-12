/** Keeps accepted async answers across thread switches and page reloads in this tab. */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { UserInputAnswers } from '@/types/approval';

interface AsyncUserInputState {
  answers: Record<string, UserInputAnswers>;
  record: (key: string, answers: UserInputAnswers) => void;
}

export const useAsyncUserInputStore = create<AsyncUserInputState>()(
  persist(
    (set) => ({
      answers: {},
      record: (key, answers) =>
        set((state) => ({
          answers: Object.fromEntries(
            [...Object.entries(state.answers), [key, answers]].slice(-200),
          ),
        })),
    }),
    {
      name: 'codex.webui.async-user-input.v1',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

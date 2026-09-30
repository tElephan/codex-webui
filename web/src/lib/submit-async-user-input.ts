/** Async question answers are ordinary user input, not pending JSON-RPC responses. */
import {
  threadsInterruptTurn,
  threadsStartTurn,
} from '@/generated/api/sdk.gen';
import { useTimelineStore } from '@/stores/timeline-store';
import { useAsyncUserInputStore } from '@/stores/async-user-input-store';
import type { UserInputAnswers, UserInputQuestion } from '@/types/approval';
import { getApiErrorMessage } from './api-error';

const submitting = new Set<string>();

export async function submitAsyncUserInput(
  threadId: string,
  itemId: string,
  questions: UserInputQuestion[],
  answers: UserInputAnswers,
): Promise<void> {
  const key = JSON.stringify([threadId, itemId]);
  if (submitting.has(key) || useAsyncUserInputStore.getState().answers[key])
    return;
  const runtime = useTimelineStore.getState().getThreadRuntime(threadId);
  if (!runtime || runtime.threadMode !== 'live')
    throw new Error('Thread is not writable');
  if (
    !questions.length ||
    questions.some((q) => !answers[q.id]?.answers.some((value) => value.trim()))
  ) {
    throw new Error('Every question needs an answer');
  }
  const text = questions
    .map((q) => `${q.question}\n${answers[q.id].answers.join('\n')}`)
    .join('\n\n');
  const input = [{ type: 'text' as const, text, text_elements: [] }];
  submitting.add(key);
  try {
    if (runtime.activeTurnId) {
      try {
        // Finish the question's pause before sending its answer. Steering the
        // interrupted turn can accept input that is then lost during cancellation.
        await threadsInterruptTurn({
          path: { threadId, turnId: runtime.activeTurnId },
          throwOnError: true,
        });
      } catch (error) {
        // The automatic pause may already have completed.
        if (
          !/no active turn|not active|already (?:completed|finished)/i.test(
            getApiErrorMessage(error),
          )
        )
          throw error;
      }
    }
    const { data } = await threadsStartTurn({
      path: { threadId },
      body: { input },
      throwOnError: true,
    });
    const store = useTimelineStore.getState();
    store.addUserMessageForThread(threadId, text, undefined, data.turn.id);
    store.setActiveTurnIdForThread(threadId, data.turn.id);
    store.setLoadingForThread(threadId, true);
    useAsyncUserInputStore.getState().record(key, answers);
  } finally {
    submitting.delete(key);
  }
}

/** Client-side follow-up queue for messages that should start after the active turn. */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { threadsStartTurn } from '@/generated/api/sdk.gen';
import type { StartTurnDto } from '@/generated/api/types.gen';
import i18n from '@/i18n';
import { getApiErrorMessage } from '@/lib/api-error';
import { useTimelineStore } from '@/stores/timeline-store';

type QueuedTurnInput = StartTurnDto['input'];

export interface QueuedTurn {
  id: string;
  threadId: string;
  input: QueuedTurnInput;
  displayText: string;
  model?: StartTurnDto['model'];
  effort?: StartTurnDto['effort'];
  createdAt: number;
  status: 'queued' | 'sending' | 'failed';
  error?: string;
}

interface EnqueueQueuedTurn {
  threadId: string;
  input: QueuedTurnInput;
  displayText: string;
  model?: StartTurnDto['model'];
  effort?: StartTurnDto['effort'];
}

interface QueuedTurnState {
  queues: Record<string, QueuedTurn[]>;
  enqueue: (turn: EnqueueQueuedTurn) => QueuedTurn;
  remove: (threadId: string, itemId: string) => void;
  updateText: (threadId: string, itemId: string, text: string) => void;
  move: (threadId: string, itemId: string, direction: -1 | 1) => void;
  markSending: (threadId: string, itemId: string) => void;
  markFailed: (threadId: string, itemId: string, error: string) => void;
}

const dispatchingThreads = new Set<string>();

function nextQueueId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `queued-${Date.now()}-${Math.random()}`
  );
}

function updateQueue(
  queues: Record<string, QueuedTurn[]>,
  threadId: string,
  updater: (queue: QueuedTurn[]) => QueuedTurn[],
): Record<string, QueuedTurn[]> {
  const next = updater(queues[threadId] ?? []);
  const updated = { ...queues };
  if (next.length > 0) updated[threadId] = next;
  else delete updated[threadId];
  return updated;
}

function replaceTextInput(
  input: QueuedTurnInput,
  text: string,
): QueuedTurnInput {
  const trimmed = text.trim();
  const existingIndex = input.findIndex((item) => item.type === 'text');
  if (!trimmed) {
    return existingIndex >= 0
      ? input.filter((_item, index) => index !== existingIndex)
      : input;
  }

  const textItem = { type: 'text' as const, text: trimmed, text_elements: [] };
  if (existingIndex < 0) return [...input, textItem];
  const next = [...input];
  next[existingIndex] = textItem;
  return next;
}

export function queuedTurnAttachmentCount(turn: QueuedTurn): number {
  return turn.input.filter((item) => item.type !== 'text').length;
}

export const useQueuedTurnStore = create<QueuedTurnState>()(
  persist(
    (set) => ({
      queues: {},
      enqueue: (input) => {
        const turn: QueuedTurn = {
          ...input,
          id: nextQueueId(),
          createdAt: Date.now(),
          status: 'queued',
        };
        set((state) => ({
          queues: updateQueue(state.queues, input.threadId, (queue) => [
            ...queue,
            turn,
          ]),
        }));
        return turn;
      },
      remove: (threadId, itemId) =>
        set((state) => ({
          queues: updateQueue(state.queues, threadId, (queue) =>
            queue.filter((item) => item.id !== itemId),
          ),
        })),
      updateText: (threadId, itemId, text) =>
        set((state) => ({
          queues: updateQueue(state.queues, threadId, (queue) =>
            queue.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    displayText: text.trim(),
                    input: replaceTextInput(item.input, text),
                    status: 'queued',
                    error: undefined,
                  }
                : item,
            ),
          ),
        })),
      move: (threadId, itemId, direction) =>
        set((state) => ({
          queues: updateQueue(state.queues, threadId, (queue) => {
            const from = queue.findIndex((item) => item.id === itemId);
            const to = from + direction;
            if (from < 0 || to < 0 || to >= queue.length) return queue;
            const next = [...queue];
            [next[from], next[to]] = [next[to], next[from]];
            return next;
          }),
        })),
      markSending: (threadId, itemId) =>
        set((state) => ({
          queues: updateQueue(state.queues, threadId, (queue) =>
            queue.map((item) =>
              item.id === itemId
                ? { ...item, status: 'sending', error: undefined }
                : item,
            ),
          ),
        })),
      markFailed: (threadId, itemId, error) =>
        set((state) => ({
          queues: updateQueue(state.queues, threadId, (queue) =>
            queue.map((item) =>
              item.id === itemId ? { ...item, status: 'failed', error } : item,
            ),
          ),
        })),
    }),
    {
      name: 'codex.webui.queued-turns.v1',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ queues: state.queues }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<QueuedTurnState> | undefined;
        const queues = Object.fromEntries(
          Object.entries(saved?.queues ?? {}).map(([threadId, queue]) => [
            threadId,
            queue.map((item) =>
              item.status === 'sending'
                ? { ...item, status: 'queued' as const, error: undefined }
                : item,
            ),
          ]),
        );
        return { ...current, queues };
      },
    },
  ),
);

/** Starts one queued message when the thread is idle. Failed items require manual retry. */
export async function dispatchNextQueuedTurn(
  threadId: string,
  itemId?: string,
): Promise<boolean> {
  if (dispatchingThreads.has(threadId)) return false;

  const runtime = useTimelineStore.getState().getThreadRuntime(threadId);
  if (
    !runtime ||
    runtime.threadMode !== 'live' ||
    runtime.activeTurnId ||
    runtime.loading
  ) {
    return false;
  }

  const queue = useQueuedTurnStore.getState().queues[threadId] ?? [];
  const item = itemId
    ? queue.find((candidate) => candidate.id === itemId)
    : queue[0];
  if (!item || (!itemId && item.status === 'failed')) return false;

  dispatchingThreads.add(threadId);
  useQueuedTurnStore.getState().markSending(threadId, item.id);

  try {
    const { data } = await threadsStartTurn({
      path: { threadId },
      body: {
        input: item.input,
        ...(item.model && { model: item.model }),
        ...(item.effort && { effort: item.effort }),
      },
      throwOnError: true,
    });
    if (!data?.turn?.id) throw new Error(i18n.t('Request failed'));

    const images = item.input.flatMap((input) =>
      input.type === 'localImage'
        ? [input.path]
        : input.type === 'image'
          ? [input.url]
          : [],
    );
    const timeline = useTimelineStore.getState();
    timeline.addUserMessageForThread(
      threadId,
      item.displayText,
      images.length > 0 ? images : undefined,
      data.turn.id,
    );
    timeline.setActiveTurnIdForThread(threadId, data.turn.id);
    timeline.setLoadingForThread(threadId, true);
    useQueuedTurnStore.getState().remove(threadId, item.id);
    return true;
  } catch (error) {
    const message = getApiErrorMessage(error);
    useQueuedTurnStore.getState().markFailed(threadId, item.id, message);
    useTimelineStore
      .getState()
      .addSystemMessageForThread(
        threadId,
        i18n.t('Queued message failed: {{error}}', { error: message }),
        'error',
      );
    return false;
  } finally {
    dispatchingThreads.delete(threadId);
  }
}

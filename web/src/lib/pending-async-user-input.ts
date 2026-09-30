import type { UserInputAnswers } from '@/types/approval';
import type { TimelineEntry } from '@/types/timeline';

/** A later user turn supersedes older questions; the latest questions wait for submission. */
export function findPendingAsyncUserInput(
  threadId: string | null,
  timeline: TimelineEntry[],
  answers: Record<string, UserInputAnswers>,
): { turnId: string; itemId: string } | undefined {
  if (!threadId) return;
  const turn = timeline.findLast((entry) => entry.kind !== 'system');
  if (turn?.kind !== 'turn') return;
  const item = turn.items.find(
    (item) =>
      item.type === 'agentMessage' &&
      !!item.questions?.length &&
      !answers[JSON.stringify([threadId, item.itemId])],
  );
  if (item) return { turnId: turn.turnId, itemId: item.itemId };
}

import {
  pendingApprovalsListPending,
  threadsReadThread,
  tokenUsageReadThreadTokenUsage,
  turnDiffReadThreadTurnDiffs,
  turnErrorsReadThreadTurnErrors,
} from '@/generated/api/sdk.gen';
import {
  useTimelineStore,
  type ThreadRuntimeState,
} from '@/stores/timeline-store';
import type { PendingServerRequestDto } from '@/generated/api';
import { useThreadSyncStore } from '@/stores/thread-sync-store';
import { dispatchNextQueuedTurn } from '@/stores/queued-turn-store';
import { approvalFromPending } from './pending-requests';
import { userInputFromPending } from './user-input-parsers';

const inFlight = new Map<string, Promise<void>>();

/** Restore requests missed while offline, including resolutions made in another window. */
function reconcilePendingRequests(
  threadId: string,
  before: ThreadRuntimeState,
  requests: PendingServerRequestDto[],
) {
  const store = useTimelineStore.getState();
  if (!store.getThreadRuntime(threadId)) return;
  const pendingIds = new Set(
    requests.map((request) => String(request.requestId)),
  );
  for (const request of [
    ...Object.values(before.approvals),
    ...Object.values(before.userInputRequests),
  ]) {
    const current = store.getThreadRuntime(threadId)!;
    const latest =
      request.kind === 'userInput'
        ? current.userInputRequests[String(request.requestId)]
        : current.approvals[request.itemId];
    if (
      request.status === 'pending' &&
      latest === request &&
      !pendingIds.has(String(request.requestId))
    ) {
      store.resolveApprovalByRequestIdForThread(threadId, request.requestId);
    }
  }
  for (const request of requests) {
    const current = store.getThreadRuntime(threadId)!;
    const existing = [
      ...Object.values(current.approvals),
      ...Object.values(current.userInputRequests),
    ].find((entry) => String(entry.requestId) === String(request.requestId));
    if (existing) continue; // Never reopen a request resolved while this read was in flight.
    const approval = approvalFromPending(request);
    if (approval) store.addApprovalForThread(threadId, approval);
    const input = userInputFromPending(request);
    if (input) store.addUserInputRequestForThread(threadId, input);
  }
}

/** Concurrent callers share one read; only previously queued follow-ups may be dispatched. */
export function syncThread(threadId: string, force = false): Promise<void> {
  const pending = inFlight.get(threadId);
  if (pending) return pending;
  const state = useThreadSyncStore.getState();
  const last = state.threads[threadId];
  if (!force && last && Date.now() - last.checkedAt < 1500)
    return Promise.resolve();
  const before = useTimelineStore.getState().getThreadRuntime(threadId);
  if (!before || before.threadMode !== 'live') return Promise.resolve();

  state.setStatus(threadId, 'syncing');
  const task = (async () => {
    try {
      const signal = AbortSignal.timeout(20_000);
      const [history, requests] = await Promise.allSettled([
        threadsReadThread({
          path: { threadId },
          query: { includeTurns: true },
          signal,
          throwOnError: true,
        }),
        pendingApprovalsListPending({
          query: { threadIds: threadId },
          signal,
          throwOnError: true,
        }),
      ]);
      if (history.status === 'rejected') {
        if (requests.status === 'fulfilled')
          reconcilePendingRequests(
            threadId,
            before,
            requests.value.data.requests,
          );
        throw history.reason;
      }
      const store = useTimelineStore.getState();
      const applied = store.reconcileThreadSnapshot(
        history.value.data.thread,
        before,
      );
      if (requests.status === 'rejected') throw requests.reason;
      reconcilePendingRequests(threadId, before, requests.value.data.requests);
      state.setStatus(threadId, applied ? 'idle' : 'pending');
      if (!applied) return; // A live event won the race; retry once activity settles.

      const snapshot = store.getThreadRuntime(threadId)!;
      const [tokens, diffs, errors] = await Promise.allSettled([
        tokenUsageReadThreadTokenUsage({ path: { threadId }, signal }),
        turnDiffReadThreadTurnDiffs({ path: { threadId }, signal }),
        turnErrorsReadThreadTurnErrors({ path: { threadId }, signal }),
      ]);
      const current = store.getThreadRuntime(threadId);
      if (!current) return;
      if (
        tokens.status === 'fulfilled' &&
        tokens.value.data &&
        current.latestTokenUsage === snapshot.latestTokenUsage
      ) {
        store.hydrateTokenUsageForThread(threadId, tokens.value.data.turns);
      }
      if (current.timeline === snapshot.timeline) {
        if (diffs.status === 'fulfilled' && diffs.value.data)
          store.hydrateTurnDiffsForThread(threadId, diffs.value.data.turns);
        if (errors.status === 'fulfilled' && errors.value.data)
          store.hydrateTurnErrorsForThread(threadId, errors.value.data.errors);
      }
      void dispatchNextQueuedTurn(threadId);
    } catch {
      state.setStatus(threadId, 'error');
    }
  })().finally(() => inFlight.delete(threadId));
  inFlight.set(threadId, task);
  return task;
}

/** Bound recovery traffic even when many conversations were open before reconnecting. */
export async function syncThreads(threadIds: string[]) {
  const remaining = [...new Set(threadIds)];
  await Promise.all(
    Array.from({ length: Math.min(4, remaining.length) }, async () => {
      let threadId: string | undefined;
      while ((threadId = remaining.shift())) await syncThread(threadId);
    }),
  );
}

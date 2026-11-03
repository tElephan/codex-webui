import {
  pendingApprovalsListPending,
  threadsReadThread,
  threadsResumeThread,
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
import { useConnectionStore } from '@/stores/connection-store';
import { dispatchNextQueuedTurn } from '@/stores/queued-turn-store';
import { approvalFromPending } from './pending-requests';
import { userInputFromPending } from './user-input-parsers';

const inFlight = new Map<string, Promise<void>>();
const opening = new Map<string, Promise<void>>();

/** A subscribed conversation stays current through socket events until a connection gap. */
function canReuseThread(threadId: string): boolean {
  const store = useTimelineStore.getState();
  const runtime = store.getThreadRuntime(threadId);
  const connection = useConnectionStore.getState();
  const sync = useThreadSyncStore.getState().threads[threadId];
  return Boolean(
    connection.connected &&
    store.subscribedThreadIds.has(threadId) &&
    runtime?.hydrated && runtime.threadMode === 'live' &&
    runtime.threadStatus?.type !== 'systemError' &&
    runtime.threadStatus?.type !== 'notLoaded' &&
    sync?.status === 'idle' && sync.connectionEpoch === connection.epoch,
  );
}

/** One owner for route, sidebar and StrictMode opens; recovery shares the same operation. */
export function openThread(threadId: string): Promise<void> {
  const reusable = canReuseThread(threadId);
  useTimelineStore.getState().setActiveThread(threadId);
  const existing = opening.get(threadId);
  if (existing) return existing;
  if (reusable) return Promise.resolve();

  const recovering = inFlight.get(threadId);
  let retrySnapshot = false;
  const task = (async () => {
    // A reconnect may already be recovering this conversation. Let it finish
    // before deciding whether another read is needed.
    if (recovering) {
      await recovering;
      if (canReuseThread(threadId)) return;
    }
    const store = useTimelineStore.getState();
    if (!store.getThreadRuntime(threadId)) return;
    if (!store.getThreadRuntime(threadId)!.hydrated)
      store.setLoadingForThread(threadId, true);
    store.setThreadModeForThread(threadId, 'live');
    const before = store.getThreadRuntime(threadId)!;
    const state = useThreadSyncStore.getState();
    const connectionEpoch = useConnectionStore.getState().epoch;
    state.setStatus(threadId, 'syncing', connectionEpoch);
    try {
      const signal = AbortSignal.timeout(20_000);
      const [history, requests] = await Promise.allSettled([
        threadsResumeThread({ path: { threadId }, signal, throwOnError: true }),
        pendingApprovalsListPending({
          query: { threadIds: threadId }, signal, throwOnError: true,
        }),
      ]);
      if (history.status === 'rejected') {
        if (requests.status === 'fulfilled')
          reconcilePendingRequests(threadId, before, requests.value.data.requests);
        throw history.reason;
      }
      const response = history.value.data;
      const applied = store.reconcileThreadSnapshot(
        { ...response.thread, cwd: response.cwd }, before,
      );
      if (requests.status === 'fulfilled')
        reconcilePendingRequests(threadId, before, requests.value.data.requests);
      state.setStatus(threadId, requests.status === 'rejected' ? 'error' :
        applied ? 'idle' : 'pending', connectionEpoch);
      if (!applied) {
        retrySnapshot = true;
        return;
      }
      void dispatchNextQueuedTurn(threadId);
      await hydrateThreadDetails(threadId, store.getThreadRuntime(threadId)!, signal);
    } catch (error) {
      state.setStatus(threadId, 'error', connectionEpoch);
      if (!before.hydrated) store.setLoadingForThread(threadId, false);
      throw error;
    }
  })().finally(() => opening.delete(threadId)).then(() => {
    // A live event can invalidate the resume snapshot. Retry once using the
    // current runtime, without waiting for the periodic recovery timer.
    if (retrySnapshot) return syncThread(threadId, true);
  });
  opening.set(threadId, task);
  return task;
}

async function hydrateThreadDetails(
  threadId: string,
  snapshot: ThreadRuntimeState,
  signal: AbortSignal,
) {
  const [tokens, diffs, errors] = await Promise.allSettled([
    tokenUsageReadThreadTokenUsage({ path: { threadId }, signal }),
    turnDiffReadThreadTurnDiffs({ path: { threadId }, signal }),
    turnErrorsReadThreadTurnErrors({ path: { threadId }, signal }),
  ]);
  const store = useTimelineStore.getState();
  const current = store.getThreadRuntime(threadId);
  if (!current) return;
  if (tokens.status === 'fulfilled' && tokens.value.data &&
    current.latestTokenUsage === snapshot.latestTokenUsage)
    store.hydrateTokenUsageForThread(threadId, tokens.value.data.turns);
  if (current.timeline === snapshot.timeline) {
    if (diffs.status === 'fulfilled' && diffs.value.data)
      store.hydrateTurnDiffsForThread(threadId, diffs.value.data.turns);
    if (errors.status === 'fulfilled' && errors.value.data)
      store.hydrateTurnErrorsForThread(threadId, errors.value.data.errors);
  }
}

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
  const open = opening.get(threadId);
  if (open) return open.catch(() => undefined).then(() => {
    const connection = useConnectionStore.getState();
    const last = useThreadSyncStore.getState().threads[threadId];
    if (connection.connected && last?.connectionEpoch !== connection.epoch)
      return syncThread(threadId, true);
  });
  const pending = inFlight.get(threadId);
  if (pending) return pending;
  const state = useThreadSyncStore.getState();
  const last = state.threads[threadId];
  const connectionEpoch = useConnectionStore.getState().epoch;
  if (!force && last?.status === 'idle' && last.connectionEpoch === connectionEpoch &&
    Date.now() - last.checkedAt < 1500)
    return Promise.resolve();
  const before = useTimelineStore.getState().getThreadRuntime(threadId);
  if (!before || before.threadMode !== 'live') return Promise.resolve();
  const includeHistory = before.hydrated || useTimelineStore.getState().threadId === threadId;
  state.setStatus(threadId, 'syncing', connectionEpoch);
  const task = (async () => {
    try {
      const signal = AbortSignal.timeout(20_000);
      const [history, requests] = await Promise.allSettled([
        threadsReadThread({
          path: { threadId },
          query: { includeTurns: includeHistory },
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
      const reconcile = includeHistory
        ? store.reconcileThreadSnapshot
        : store.reconcileThreadSummary;
      const applied = reconcile(
        history.value.data.thread,
        before,
      );
      if (requests.status === 'rejected') throw requests.reason;
      reconcilePendingRequests(threadId, before, requests.value.data.requests);
      state.setStatus(threadId, applied ? 'idle' : 'pending', connectionEpoch);
      if (!applied) return; // A live event won the race; retry once activity settles.
      if (!includeHistory) {
        void dispatchNextQueuedTurn(threadId);
        return;
      }

      await hydrateThreadDetails(threadId, store.getThreadRuntime(threadId)!, signal);
      void dispatchNextQueuedTurn(threadId);
    } catch {
      state.setStatus(threadId, 'error', connectionEpoch);
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

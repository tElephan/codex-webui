import type { v2 } from '../codex/codex-schema';
import { isNotMaterializedError } from './thread-errors';

type CodexRequester = {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
};

type ThreadWithHistoryMode = v2.Thread & { historyMode?: string };

/**
 * Reads a thread without using deprecated full-history hydration for paginated
 * threads. Legacy threads retain the old includeTurns path for compatibility.
 */
export async function readThreadWithTurns(
  codex: CodexRequester,
  threadId: string,
  itemsView: v2.TurnItemsView = 'full',
): Promise<v2.ThreadReadResponse> {
  const summary = await codex.request<v2.ThreadReadResponse>('thread/read', {
    threadId,
    includeTurns: false,
  });
  const thread = summary.thread as ThreadWithHistoryMode;

  // Older test doubles and pre-historyMode app-server responses may already
  // carry turns; preserve that response when the mode cannot be identified.
  if (thread.historyMode === undefined) return summary;

  if (thread.historyMode !== 'paginated') {
    try {
      return await codex.request<v2.ThreadReadResponse>('thread/read', {
        threadId,
        includeTurns: true,
      });
    } catch (err) {
      if (!isNotMaterializedError(err)) throw err;
      return { thread: { ...summary.thread, turns: [] } };
    }
  }

  try {
    const turns: v2.Turn[] = [];
    let cursor: string | null = null;
    do {
      const page = await codex.request<v2.ThreadTurnsListResponse>(
        'thread/turns/list',
        {
          threadId,
          cursor,
          limit: 100,
          sortDirection: 'asc',
          itemsView,
        },
      );
      turns.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);

    return { thread: { ...summary.thread, turns } };
  } catch (err) {
    if (!isNotMaterializedError(err)) throw err;
    return { thread: { ...summary.thread, turns: [] } };
  }
}

/**
 * Virtualized scrollable message timeline.
 * Uses TanStack Virtual for efficient rendering of long conversations.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Bot, Loader2, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useCreateMessageBranch,
  useMessageVersions,
  type MessageVersions,
} from '@/hooks/use-message-branches';
import {
  adoptionBlockReason,
  pickSurvivingVersion,
  useBranchAdoptionStatus,
  useDeletePreview,
  useDeleteThread,
} from '@/hooks/use-thread-deletion';
import { DeleteConversationDialog } from '@/components/branches/delete-conversation-dialog';
import { getApiErrorMessage } from '@/lib/api-error';
import { useTimelineStore } from '@/stores/timeline-store';
import type { TimelineEntry } from '@/types/timeline';
import { MessageVersionSwitcher } from './message-version-switcher';
import { TurnBlock } from './turn-block';
import { UserMessageBubble } from './user-message-bubble';

/** Returns true if the scroll container is near the bottom. */
function isNearBottom(el: HTMLElement, threshold = 2): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

interface Props {
  onEditMessage?: (message: string) => void;
}

export function ChatTimeline({ onEditMessage }: Props) {
  'use no memo'; // TanStack Virtual is incompatible with React Compiler memoization
  const { t } = useTranslation();
  const timeline = useTimelineStore((s) => s.timeline);
  const threadId = useTimelineStore((s) => s.threadId);
  const threadCwd = useTimelineStore((s) => s.threadCwd);
  const threadMode = useTimelineStore((s) => s.threadMode);
  const loading = useTimelineStore((s) => s.loading);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);

  const { versionsByTurnId } = useMessageVersions(threadId);
  const adoptionStatus = useBranchAdoptionStatus();
  const deleteBlockedReason = adoptionBlockReason(adoptionStatus.data, t);
  // The sibling ordering is captured when the dialog opens rather than looked
  // up on confirm: the group is about to change underneath us, and the whole
  // point is to land on the neighbour the switcher was showing at that moment.
  const [deleteTarget, setDeleteTarget] = useState<{
    threadId: string;
    siblingThreadIds: string[];
  } | null>(null);
  const deletePreview = useDeletePreview(deleteTarget?.threadId ?? null);
  const deleteVersion = useDeleteThread({
    onFinished: () => setDeleteTarget(null),
    resolveSurvivor: (doomed) =>
      deleteTarget
        ? pickSurvivingVersion(
            deleteTarget.threadId,
            deleteTarget.siblingThreadIds,
            doomed,
          )
        : null,
  });
  const createBranch = useCreateMessageBranch((text) => {
    setEditingTurnId(null);
    if (text) onEditMessage?.(text);
  });

  // A turn cannot be branched while the conversation is busy, and the newest
  // user message has no turn id until `turn/started` arrives.
  const canBranch =
    threadMode === 'live' && !loading && !createBranch.isPending;

  // ── Virtualizer ─────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const lastTouchY = useRef<number | null>(null);
  const shouldAutoScroll = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const initialScrollThreadRef = useRef<string | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual known limitation
  const virtualizer = useVirtualizer({
    count: timeline.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
    // Start at the end when the scroll element is attached after hydration.
    // Without this, some tablet browsers keep the virtualizer at offset 0
    // because the first measurement happens before the flex container settles.
    initialOffset: () => Number.MAX_SAFE_INTEGER,
  });

  // Only compensate for rows entirely above the viewport. A streamed turn can
  // span many screens: growing its bottom must not move the text being read.
  useEffect(() => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (
      item,
      _delta,
      instance,
    ) => item.end <= (instance.scrollElement?.scrollTop ?? 0);
    return () => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [virtualizer]);

  const pauseFollowing = useCallback(() => {
    shouldAutoScroll.current = false;
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    if (top < lastScrollTop.current && !isNearBottom(el)) {
      pauseFollowing();
    } else if (top > lastScrollTop.current && isNearBottom(el)) {
      // Resume only after reaching the bottom, not merely passing near it.
      shouldAutoScroll.current = true;
    }
    lastScrollTop.current = top;
  }, [pauseFollowing]);

  // Use a native instant scroll. scrollToIndex keeps reconciling a moving last
  // row (including after user input), which can pull the reader back down.
  const scheduleFollow = useCallback(() => {
    if (!shouldAutoScroll.current || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const el = scrollRef.current;
      if (!el || !shouldAutoScroll.current) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      lastScrollTop.current = el.scrollTop;
    });
  }, []);

  const totalSize = virtualizer.getTotalSize();
  useEffect(() => {
    if (!threadId) initialScrollThreadRef.current = null;
    else if (
      timeline.length > 0 &&
      initialScrollThreadRef.current !== threadId
    ) {
      initialScrollThreadRef.current = threadId;
      shouldAutoScroll.current = true;
    }
    // Run again after measurements or delayed content change a row's height.
    // While paused, neither incoming text nor measurements schedule a scroll.
    if (timeline.length > 0) scheduleFollow();
  }, [threadId, timeline, totalSize, scheduleFollow]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null)
        cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    },
    [],
  );

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    let frame: number | undefined;
    const showRequest = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          threadId: string;
          turnId: string;
          requestId: string;
        }>
      ).detail;
      if (detail?.threadId !== threadId) return;
      const index = timeline.findIndex(
        (entry) => entry.kind === 'turn' && entry.turnId === detail.turnId,
      );
      if (index < 0) return;
      pauseFollowing();
      virtualizer.scrollToIndex(index, { align: 'end' });
      // The turn must first enter the virtualizer's rendered range.
      const reveal = (attempts: number) => {
        const card = scrollRef.current?.querySelector<HTMLElement>(
          `[data-request-id="${CSS.escape(detail.requestId)}"]`,
        );
        if (card) {
          card.scrollIntoView({ block: 'center', behavior: 'instant' });
          // Stop following this row's end after revealing the request inside it.
          virtualizer.scrollToOffset(scrollRef.current!.scrollTop);
          lastScrollTop.current = scrollRef.current!.scrollTop;
          pauseFollowing();
        } else if (attempts > 0)
          frame = requestAnimationFrame(() => reveal(attempts - 1));
      };
      frame = requestAnimationFrame(() => reveal(3));
    };
    window.addEventListener('codex-webui:show-request', showRequest);
    return () => {
      window.removeEventListener('codex-webui:show-request', showRequest);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [threadId, timeline, virtualizer, pauseFollowing]);

  // ── Empty states ────────────────────────────────────────────────────
  // Uses the same scroll container as the populated list: switching versions
  // passes through this state, and a gutter that appears and disappears with it
  // would shift the whole message column sideways.
  if (timeline.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto [scrollbar-gutter:stable]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mb-3 h-8 w-8 animate-spin opacity-40" />
            <p className="text-sm">{t('Loading...')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Bot className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-sm">
              {threadId
                ? t('Send a message to start the conversation.')
                : t('Create a new thread to begin.')}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Virtualized list ────────────────────────────────────────────────
  return (
    <>
      {/* `scrollbar-gutter` keeps the gutter reserved: switching versions swaps
          the timeline through an empty state, and letting the scrollbar come and
          go with it visibly shifts every message sideways. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={(event) => {
          if (event.deltaY < 0) pauseFollowing();
          else if (event.deltaY > 0 && isNearBottom(event.currentTarget))
            shouldAutoScroll.current = true;
        }}
        onTouchStart={(event) => {
          lastTouchY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(event) => {
          const y = event.touches[0]?.clientY;
          if (
            y !== undefined &&
            lastTouchY.current !== null &&
            y > lastTouchY.current
          )
            pauseFollowing();
          else if (
            y !== undefined &&
            lastTouchY.current !== null &&
            y < lastTouchY.current &&
            isNearBottom(event.currentTarget)
          )
            shouldAutoScroll.current = true;
          lastTouchY.current = y ?? null;
        }}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest(
              'input, textarea, select, button, [contenteditable="true"]',
            )
          )
            return;
          if (
            ['ArrowUp', 'PageUp', 'Home'].includes(event.key) ||
            (event.key === ' ' && event.shiftKey)
          )
            pauseFollowing();
          else if (
            ['ArrowDown', 'PageDown', 'End', ' '].includes(event.key) &&
            isNearBottom(event.currentTarget)
          )
            shouldAutoScroll.current = true;
        }}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
      >
        <div
          className="relative px-3 sm:px-4 lg:px-6"
          style={{ height: `${totalSize}px` }}
        >
          <div
            className="absolute left-0 top-0 w-full px-3 sm:px-4 lg:px-6"
            style={{
              transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
            }}
          >
            {virtualItems.map((virtualItem) => {
              const entry = timeline[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  className="py-2"
                >
                  <TimelineEntryRow
                    entry={entry}
                    threadCwd={threadCwd}
                    canBranch={canBranch}
                    versionsByTurnId={versionsByTurnId}
                    deleteBlockedReason={deleteBlockedReason}
                    onDeleteVersion={(threadId, siblingThreadIds) =>
                      setDeleteTarget({ threadId, siblingThreadIds })
                    }
                    editingTurnId={editingTurnId}
                    editPending={createBranch.isPending}
                    onEdit={(turnId) => setEditingTurnId(turnId)}
                    onCancelEdit={() => setEditingTurnId(null)}
                    onSaveEdit={(turnId, content) => {
                      if (!threadId) return;
                      createBranch.mutate({
                        path: { threadId },
                        body: { editedTurnId: turnId, previewText: content },
                      });
                    }}
                    t={t}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DeleteConversationDialog
        open={deleteTarget !== null}
        preview={deletePreview.data ?? null}
        loading={deletePreview.isLoading}
        errorMessage={
          deletePreview.error ? getApiErrorMessage(deletePreview.error) : null
        }
        pending={deleteVersion.isPending}
        currentThreadId={threadId}
        onConfirm={(preview) =>
          deleteVersion.mutate({
            path: { threadId: preview.targetThreadId },
            body: { expectedThreadIds: preview.threadIds },
          })
        }
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

/** Renders a single timeline entry (user message, system message, or turn block). */
function TimelineEntryRow({
  entry,
  threadCwd,
  canBranch,
  versionsByTurnId,
  deleteBlockedReason,
  onDeleteVersion,
  editingTurnId,
  editPending,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  t,
}: {
  entry: TimelineEntry;
  threadCwd: string | null;
  canBranch: boolean;
  versionsByTurnId: Map<string, MessageVersions>;
  deleteBlockedReason: string | null;
  onDeleteVersion: (threadId: string, siblingThreadIds: string[]) => void;
  editingTurnId: string | null;
  editPending: boolean;
  onEdit: (turnId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (turnId: string, content: string) => void;
  t: (key: string) => string;
}) {
  if (entry.kind === 'user') {
    const turnId = entry.turnId;
    const versions = turnId ? versionsByTurnId.get(turnId) : undefined;
    return (
      <div className="group/user flex flex-col items-end">
        <div
          className="max-w-2xl overflow-hidden rounded-2xl bg-blue-600 px-4 py-3 text-white [&_a]:text-blue-200 [&_a]:underline [&_blockquote]:text-white/70 [&_code]:bg-white/15 [&_del]:text-white/70"
          style={{
            boxShadow:
              '0 8px 24px rgba(59, 130, 246, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1px 0 rgba(0, 0, 0, 0.12)',
          }}
        >
          <UserMessageBubble
            content={entry.content}
            threadCwd={threadCwd}
            images={entry.images}
            editing={editingTurnId === turnId}
            editPending={editPending}
            onCancelEdit={onCancelEdit}
            onSaveEdit={turnId ? (content) => onSaveEdit(turnId, content) : undefined}
          />
        </div>
        {/* Reserved even when empty so revealing the controls cannot shift layout. */}
        <div className="mt-1 flex h-6 items-center gap-1 opacity-100 transition-opacity [@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:focus-within:opacity-100 [@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:group-hover/user:opacity-100">
          {versions && (
            <MessageVersionSwitcher
              versions={versions}
              deleteBlockedReason={deleteBlockedReason}
              onDeleteVersion={onDeleteVersion}
            />
          )}
          {/* Rendered whenever the message has a turn, disabled rather than
              removed — dropping it mid-switch would move the version switcher. */}
          {turnId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('Edit this message')}
                  disabled={!canBranch}
                  className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  onClick={() => onEdit(turnId)}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('Edit this message')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    );
  }

  if (entry.kind === 'system') {
    const severity = entry.severity ?? 'error';
    const colorMap = {
      info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
      error: 'bg-destructive/10 text-destructive',
    } as const;
    return (
      <div className="text-center">
        <span className={`inline-block rounded-lg px-3 py-1.5 text-sm ${colorMap[severity]}`}>
          {entry.content}
        </span>
      </div>
    );
  }

  return <TurnBlock entry={entry} />;
}

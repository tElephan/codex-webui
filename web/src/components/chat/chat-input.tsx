/**
 * Chat message input orchestrator.
 * Delegates attachment management to useChatAttachments and @ mention to useChatMention.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ChevronUp,
  CornerDownLeft,
  GitFork,
  ListPlus,
  Loader2,
  MessageSquarePlus,
  Send,
  Square,
  TerminalSquare,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  threadsInterruptTurnMutation,
  threadsListBranchTreesQueryKey,
  threadsReadBranchTreeQueryKey,
  threadsStartTurnMutation,
  threadsSteerTurnMutation,
} from '@/generated/api/@tanstack/react-query.gen';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-error';
import { useTimelineStore } from '@/stores/timeline-store';
import { useModelStore } from '@/stores/model-store';
import { useChatDraftStore } from '@/stores/chat-draft-store';
import {
  dispatchNextQueuedTurn,
  type QueuedTurn,
  queuedTurnAttachmentCount,
  useQueuedTurnStore,
} from '@/stores/queued-turn-store';
import type { StartTurnDto } from '@/generated/api/types.gen';
import { useChatAttachments } from '@/hooks/use-chat-attachments';
import { useChatMention } from '@/hooks/use-chat-mention';
import { SecurityPolicyBadge } from './security-policy-badge';
import { ModelSelector } from './model-selector';
import { TokenUsageRing } from './token-usage-ring';
import { McpStatusBadge } from './mcp-status-badge';
import { SkillSelector } from './skill-selector';
import { AttachmentChips } from './attachment-chips';
import { MentionPopover } from './mention-popover';
import { QueuedTurnList } from './queued-turn-list';

function isNoActiveTurnError(message: string): boolean {
  return /no active turn to steer|active turn.*(?:mismatch|finished|not found)/i.test(
    message,
  );
}

function followUpLabel(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

/** Imperative handle exposed via ref for external input manipulation. */
export interface ChatInputHandle {
  setInput: (value: string) => void;
  addFileAttachment: (displayName: string, absolutePath: string) => void;
}

interface Props {
  panelOpen: boolean;
  onTogglePanel: () => void;
  onForkReadOnly: () => void;
  forkPending: boolean;
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
  { panelOpen, onTogglePanel, onForkReadOnly, forkPending },
  ref,
) {
  const threadId = useTimelineStore((s) => s.threadId);
  const value = useChatDraftStore((s) =>
    threadId ? (s.drafts[threadId] ?? '') : '',
  );
  const setDraft = useChatDraftStore((s) => s.setDraft);
  const setValue = useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (update) => {
      if (threadId) setDraft(threadId, update);
    },
    [setDraft, threadId],
  );
  const valueRef = useRef(value);
  const [followUpMenuOpen, setFollowUpMenuOpen] = useState(false);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { t } = useTranslation();
  const threadCwd = useTimelineStore((s) => s.threadCwd);
  const threadMode = useTimelineStore((s) => s.threadMode);
  const loading = useTimelineStore((s) => s.loading);
  const activeTurnId = useTimelineStore((s) => s.activeTurnId);
  const hasPendingApproval = useTimelineStore((s) => {
    const flagBlocked =
      s.threadStatus?.type === 'active' &&
      s.threadStatus.activeFlags.includes('waitingOnApproval');
    const cardBlocked = Object.values(s.approvals).some(
      (a) => a.status === 'pending',
    );
    return flagBlocked || cardBlocked;
  });
  const addUserMessage = useTimelineStore((s) => s.addUserMessage);
  const addSystemError = useTimelineStore((s) => s.addSystemError);
  const addSystemMessageForThread = useTimelineStore(
    (s) => s.addSystemMessageForThread,
  );
  const addSystemErrorForThread = useTimelineStore(
    (s) => s.addSystemErrorForThread,
  );
  const clearActiveTurnForThread = useTimelineStore(
    (s) => s.clearActiveTurnForThread,
  );
  const enqueueTurn = useQueuedTurnStore((s) => s.enqueue);
  const removeQueuedTurn = useQueuedTurnStore((s) => s.remove);
  const markQueuedTurnSending = useQueuedTurnStore((s) => s.markSending);
  const markQueuedTurnFailed = useQueuedTurnStore((s) => s.markFailed);
  const nextQueuedTurn = useQueuedTurnStore((s) =>
    threadId ? s.queues[threadId]?.[0] : undefined,
  );
  const readOnly = threadMode === 'readOnly';
  const writerConflict = threadMode === 'writerConflict';
  const inputDisabled = readOnly || writerConflict;
  const hasActiveTurn = Boolean(threadId && activeTurnId && !inputDisabled);
  const canSteer = hasActiveTurn && !hasPendingApproval;

  useEffect(() => {
    if (
      threadId &&
      nextQueuedTurn?.status === 'queued' &&
      !hasActiveTurn &&
      !loading &&
      !inputDisabled
    ) {
      void dispatchNextQueuedTurn(threadId);
    }
  }, [hasActiveTurn, inputDisabled, loading, nextQueuedTurn, threadId]);

  // ── Attachment hook ──────────────────────────────────────
  const {
    attachments,
    attachmentsRef,
    setAttachments,
    chipAttachments,
    buildInput,
    clearAfterSend,
    handlePaste,
    addFileMention,
    handleRemoveAttachment,
    handleSkillSelect,
    toRelativePath,
  } = useChatAttachments({
    textareaRef,
    valueRef,
    setValue,
    threadCwd,
    addSystemError,
  });

  // ── Mention hook ─────────────────────────────────────────
  const {
    mentionOpen,
    mentionSelectedIndex,
    mentionFiltered,
    mentionLoading,
    browseRelative,
    detectMention,
    handleMentionSelect,
    handleMentionNavigate,
    handleMentionNavigateUp,
    handleMentionKeyDown,
  } = useChatMention({
    textareaRef,
    valueRef,
    cwd: threadCwd,
    setValue,
    setAttachments,
    toRelativePath,
  });

  // ── Imperative handle ────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      setInput: setValue,
      addFileAttachment: addFileMention,
    }),
    [addFileMention, setValue],
  );

  // ── Turn mutations ───────────────────────────────────────
  const queryClient = useQueryClient();
  const startTurn = useMutation({
    ...threadsStartTurnMutation(),
    onSuccess: (_res, vars) => {
      // A branch version has no turn until its edited message is sent; the
      // backend binds it during turn/start, so the cached tree is now stale and
      // the version switcher would stay hidden until it happened to refetch.
      void queryClient.invalidateQueries({
        queryKey: threadsReadBranchTreeQueryKey({
          path: { threadId: vars.path.threadId },
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: threadsListBranchTreesQueryKey(),
      });
    },
    onError: (err) => addSystemError(getApiErrorMessage(err)),
  });
  const steer = useMutation({
    ...threadsSteerTurnMutation(),
  });
  const interruptTurn = useMutation({
    ...threadsInterruptTurnMutation(),
    onError: (err) => addSystemError(getApiErrorMessage(err)),
  });

  const handleSend = useCallback(() => {
    const input = buildInput();
    if (input.length === 0 || !threadId || loading || inputDisabled) return;
    // Collect image paths for timeline display
    const imageAttachments = attachmentsRef.current
      .filter(
        (a): a is import('@/types/attachments').ChatImageAttachment =>
          a.type === 'localImage',
      )
      .map((a) => a.path);
    addUserMessage(
      valueRef.current.trim(),
      imageAttachments.length > 0 ? imageAttachments : undefined,
    );
    clearAfterSend();
    const { modelOverride, effortOverride } = useModelStore.getState();
    startTurn.mutate({
      path: { threadId },
      body: {
        input: input as never,
        ...(modelOverride && { model: modelOverride }),
        ...(effortOverride && { effort: effortOverride }),
      },
    });
  }, [
    buildInput,
    threadId,
    loading,
    inputDisabled,
    attachmentsRef,
    addUserMessage,
    clearAfterSend,
    startTurn,
  ]);

  const handleSteer = useCallback(() => {
    const input = buildInput() as StartTurnDto['input'];
    if (
      input.length === 0 ||
      !canSteer ||
      !threadId ||
      !activeTurnId ||
      steer.isPending
    )
      return;
    const targetThreadId = threadId;
    const submittedValue = valueRef.current;
    const submittedAttachmentIds = attachmentsRef.current.map(
      (item) => item.id,
    );
    const attachmentCount = input.filter((item) => item.type !== 'text').length;
    const { modelOverride, effortOverride } = useModelStore.getState();

    const clearIfUnchanged = () => {
      const currentIds = attachmentsRef.current.map((item) => item.id);
      if (
        valueRef.current === submittedValue &&
        currentIds.length === submittedAttachmentIds.length &&
        currentIds.every((id, index) => id === submittedAttachmentIds[index])
      ) {
        clearAfterSend();
      }
    };

    steer.mutate(
      {
        path: { threadId: targetThreadId, turnId: activeTurnId },
        body: { input },
      },
      {
        onSuccess: () => {
          clearIfUnchanged();
          const label =
            followUpLabel(submittedValue) ||
            t(
              attachmentCount === 1 ? '1 attachment' : '{{count}} attachments',
              {
                count: attachmentCount,
              },
            );
          addSystemMessageForThread(
            targetThreadId,
            label
              ? t('Steered current turn: {{text}}', { text: label })
              : t('Steered current turn'),
            'info',
            activeTurnId,
          );
        },
        onError: (error) => {
          const message = getApiErrorMessage(error);
          if (isNoActiveTurnError(message)) {
            clearActiveTurnForThread(targetThreadId);
            enqueueTurn({
              threadId: targetThreadId,
              input,
              displayText: submittedValue.trim(),
              ...(modelOverride && { model: modelOverride }),
              ...(effortOverride && { effort: effortOverride }),
            });
            clearIfUnchanged();
            addSystemMessageForThread(
              targetThreadId,
              t(
                'The current turn already finished. Sending this as the next turn.',
              ),
              'info',
            );
            void dispatchNextQueuedTurn(targetThreadId);
            return;
          }
          addSystemErrorForThread(targetThreadId, message);
        },
      },
    );
  }, [
    activeTurnId,
    addSystemErrorForThread,
    addSystemMessageForThread,
    attachmentsRef,
    buildInput,
    canSteer,
    clearActiveTurnForThread,
    clearAfterSend,
    enqueueTurn,
    steer,
    t,
    threadId,
    valueRef,
  ]);

  const handleQueue = useCallback(() => {
    const input = buildInput() as StartTurnDto['input'];
    if (input.length === 0 || !threadId || inputDisabled) return;
    const { modelOverride, effortOverride } = useModelStore.getState();
    enqueueTurn({
      threadId,
      input,
      displayText: valueRef.current.trim(),
      ...(modelOverride && { model: modelOverride }),
      ...(effortOverride && { effort: effortOverride }),
    });
    clearAfterSend();
    // Covers the small race where the active turn completed just before enqueue.
    void dispatchNextQueuedTurn(threadId);
  }, [
    buildInput,
    clearAfterSend,
    enqueueTurn,
    inputDisabled,
    threadId,
    valueRef,
  ]);

  const handleSendQueued = useCallback(
    (item: QueuedTurn) => {
      if (!threadId || steer.isPending) return;
      if (!hasActiveTurn) {
        void dispatchNextQueuedTurn(threadId, item.id);
        return;
      }
      if (!canSteer || !activeTurnId) return;

      markQueuedTurnSending(threadId, item.id);
      steer.mutate(
        {
          path: { threadId, turnId: activeTurnId },
          body: { input: item.input },
        },
        {
          onSuccess: () => {
            removeQueuedTurn(threadId, item.id);
            const attachmentCount = queuedTurnAttachmentCount(item);
            const label =
              followUpLabel(item.displayText) ||
              t(
                attachmentCount === 1
                  ? '1 attachment'
                  : '{{count}} attachments',
                { count: attachmentCount },
              );
            addSystemMessageForThread(
              threadId,
              label
                ? t('Steered current turn: {{text}}', { text: label })
                : t('Steered current turn'),
              'info',
              activeTurnId,
            );
          },
          onError: (error) => {
            const message = getApiErrorMessage(error);
            markQueuedTurnFailed(threadId, item.id, message);
            if (isNoActiveTurnError(message)) {
              clearActiveTurnForThread(threadId);
              void dispatchNextQueuedTurn(threadId, item.id);
              return;
            }
            addSystemErrorForThread(threadId, message);
          },
        },
      );
    },
    [
      activeTurnId,
      addSystemErrorForThread,
      addSystemMessageForThread,
      canSteer,
      clearActiveTurnForThread,
      hasActiveTurn,
      markQueuedTurnFailed,
      markQueuedTurnSending,
      removeQueuedTurn,
      steer,
      t,
      threadId,
    ],
  );

  const handleStop = useCallback(() => {
    if (!threadId || !activeTurnId || interruptTurn.isPending) return;
    interruptTurn.mutate({ path: { threadId, turnId: activeTurnId } });
  }, [threadId, activeTurnId, interruptTurn]);

  const handleSubmit = useCallback(() => {
    if (hasActiveTurn) {
      if (canSteer) handleSteer();
      else handleQueue();
      return;
    }
    handleSend();
  }, [canSteer, handleQueue, handleSend, handleSteer, hasActiveTurn]);

  // ── Input handlers ───────────────────────────────────────
  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      detectMention(newValue);
    },
    [detectMention, setValue],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (handleMentionKeyDown(e)) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleMentionKeyDown, handleSubmit],
  );

  const hasContent = value.trim().length > 0 || attachments.length > 0;

  // ── Render ───────────────────────────────────────────────
  return (
    <footer className="glass-4 sticky bottom-0 z-10 px-3 py-2.5 sm:px-4 sm:py-3 lg:px-6">
      {inputDisabled && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span className="min-w-0">
            {writerConflict
              ? t(
                  'This conversation is active in another Codex client. Continue in a new branch to avoid conflicting writers.',
                )
              : t(
                  'Archived threads are read-only. Unarchive or fork to continue.',
                )}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
            disabled={forkPending}
            onClick={onForkReadOnly}
          >
            {forkPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitFork className="h-3.5 w-3.5" />
            )}
            {t('Continue in a branch')}
          </Button>
        </div>
      )}
      <QueuedTurnList
        threadId={threadId}
        canSendNow={
          !inputDisabled &&
          !steer.isPending &&
          (hasActiveTurn ? canSteer : !loading)
        }
        onSendNow={handleSendQueued}
      />
      <div className="relative">
        <AttachmentChips
          attachments={chipAttachments}
          onRemove={handleRemoveAttachment}
          className="rounded-t-xl border border-b-0 border-border/40 bg-background/40"
        />

        <MentionPopover
          open={mentionOpen}
          browseRelative={browseRelative}
          filtered={mentionFiltered}
          isLoading={mentionLoading}
          selectedIndex={mentionSelectedIndex}
          onSelect={handleMentionSelect}
          onNavigate={handleMentionNavigate}
          onNavigateUp={handleMentionNavigateUp}
        />

        {/* Container provides border/rounding; textarea + buttons are stacked inside */}
        <div
          className={cn(
            'border border-input bg-background/60 backdrop-blur-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-primary/30',
            chipAttachments.length > 0
              ? 'rounded-b-xl border-t-0'
              : 'rounded-xl',
          )}
        >
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              inputDisabled
                ? writerConflict
                  ? t('Thread is active in another Codex client')
                  : t('Archived thread is read-only')
                : hasActiveTurn
                  ? t('Steer or queue a follow-up...')
                  : threadId
                    ? t('Type a message... (@ to mention files, paste images)')
                    : t('Create a thread first')
            }
            disabled={!threadId || inputDisabled}
            rows={1}
            className="max-h-40 min-h-20 resize-none overflow-y-auto border-none bg-transparent pr-4 pt-2.5 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              <ModelSelector />
              <SecurityPolicyBadge />
              <McpStatusBadge />
              <SkillSelector
                cwd={threadCwd}
                disabled={!threadId || inputDisabled}
                onSelect={handleSkillSelect}
              />
              <Button
                size="sm"
                variant={panelOpen ? 'secondary' : 'ghost'}
                className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
                onClick={onTogglePanel}
                disabled={!threadId || inputDisabled}
                title={t('Terminal')}
              >
                <TerminalSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('Terminal')}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <TokenUsageRing />
              {hasActiveTurn ? (
                <>
                  <Popover
                    open={followUpMenuOpen}
                    onOpenChange={setFollowUpMenuOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        size="sm"
                        className="h-7 w-7 rounded-lg px-0 text-xs transition-transform duration-200 hover:scale-105 active:scale-95 sm:w-auto sm:px-2.5"
                        disabled={!hasContent || steer.isPending}
                        title={t('Follow up')}
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {t('Follow up')}
                        </span>
                        <ChevronUp className="hidden h-3 w-3 sm:block" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      side="top"
                      sideOffset={8}
                      className="w-64 rounded-lg p-1.5"
                    >
                      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                        {t('Choose follow-up action')}
                      </p>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50"
                        disabled={!canSteer}
                        onClick={() => {
                          setFollowUpMenuOpen(false);
                          handleSteer();
                        }}
                      >
                        <CornerDownLeft className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {t('Steer current turn')}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {t('Changes the active response immediately')}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                        onClick={() => {
                          setFollowUpMenuOpen(false);
                          handleQueue();
                        }}
                      >
                        <ListPlus className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {t('Queue for next turn')}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {t('Starts automatically after the current turn')}
                          </span>
                        </span>
                      </button>
                    </PopoverContent>
                  </Popover>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-7 w-7 rounded-lg transition-transform duration-200 hover:scale-105 active:scale-95"
                    disabled={interruptTurn.isPending}
                    onClick={handleStop}
                    title={t('Stop current turn')}
                  >
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  size="icon"
                  className="h-7 w-7 rounded-lg transition-transform duration-200 hover:scale-105 active:scale-95"
                  disabled={
                    !threadId || !hasContent || loading || inputDisabled
                  }
                  onClick={handleSend}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
});

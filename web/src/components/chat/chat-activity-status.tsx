import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '@/stores/timeline-store';
import { useConnectionStore } from '@/stores/connection-store';
import { useThreadSyncStore } from '@/stores/thread-sync-store';
import { syncThread } from '@/lib/thread-sync';
import { getSocket } from '@/socket';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Stays above the composer even when the running turn has scrolled out of view. */
export function ChatActivityStatus() {
  const { t } = useTranslation();
  const threadId = useTimelineStore((s) => s.threadId);
  const mode = useTimelineStore((s) => s.threadMode);
  const connected = useConnectionStore((s) => s.connected);
  const sync = useThreadSyncStore((s) =>
    threadId ? s.threads[threadId]?.status : undefined,
  );
  const pendingRequest = useTimelineStore((s) =>
    [...Object.values(s.approvals), ...Object.values(s.userInputRequests)].find(
      (request) => request.status === 'pending',
    ),
  );
  const activity = useTimelineStore((s) => {
    if (
      Object.values(s.approvals).some((request) => request.status === 'pending')
    )
      return 'approval';
    if (
      Object.values(s.userInputRequests).some(
        (request) => request.status === 'pending',
      )
    )
      return 'input';
    if (s.threadStatus?.type === 'active') {
      if (s.threadStatus.activeFlags.includes('waitingOnApproval'))
        return 'approval';
      if (s.threadStatus.activeFlags.includes('waitingOnUserInput'))
        return 'input';
    }
    if (s.activeTurnId || s.loading) {
      const turn = s.timeline.findLast(
        (entry) => entry.kind === 'turn' && entry.turnId === s.activeTurnId,
      );
      const item = turn?.kind === 'turn' ? turn.items.at(-1) : undefined;
      if (item && !item.completed) {
        if (item.type === 'reasoning') return 'thinking';
        if (
          [
            'commandExecution',
            'mcpToolCall',
            'fileChange',
            'collabAgentToolCall',
          ].includes(item.type)
        )
          return 'tool';
      }
      return 'running';
    }
    return 'idle';
  });

  if (!threadId || mode !== 'live') return null;
  const disconnected = !connected;
  const failed = sync === 'error';
  const waiting = activity === 'approval' || activity === 'input';
  const syncing =
    sync === 'syncing' || (sync === 'pending' && activity === 'idle');
  if (!disconnected && !failed && !syncing && activity === 'idle') return null;

  const message = disconnected
    ? t('Connection lost. Reconnecting…')
    : failed
      ? t('Could not sync conversation. Retry to get the latest response.')
      : activity === 'approval'
        ? t('Waiting for your approval')
        : activity === 'input'
          ? t('Waiting for your answer')
          : syncing
            ? t('Syncing latest response…')
            : activity === 'thinking'
              ? t('Thinking…')
              : activity === 'tool'
                ? t('Running tools…')
                : t('Response in progress…');
  const Icon = disconnected
    ? WifiOff
    : failed || waiting
      ? CircleAlert
      : Loader2;
  const attention = disconnected || failed || waiting;

  return (
    <div
      className={cn(
        'mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm',
        attention
          ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
          : 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300',
      )}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <Icon
          aria-hidden="true"
          className={cn(
            'h-4 w-4 shrink-0',
            !attention && 'animate-spin motion-reduce:animate-none',
          )}
        />
        <span>{message}</span>
      </div>
      {waiting && pendingRequest && connected && !failed ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent('codex-webui:show-request', {
                detail: {
                  threadId,
                  turnId: pendingRequest.turnId,
                  requestId: String(pendingRequest.requestId),
                },
              }),
            );
          }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t('View request')}
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          disabled={connected && sync === 'syncing'}
          onClick={() => {
            if (connected) void syncThread(threadId, true);
            else getSocket().connect();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t(disconnected ? 'Reconnect' : 'Refresh status')}
        </Button>
      )}
    </div>
  );
}

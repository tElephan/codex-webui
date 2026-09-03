import { useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import type { TurnItem } from '@/types/timeline';
import { cn } from '@/lib/utils';
import { useTimelineStore } from '@/stores/timeline-store';

interface Props {
  item: TurnItem;
}

const toolLabels: Record<NonNullable<TurnItem['collabTool']>, string> = {
  spawnAgent: 'Start agent',
  sendInput: 'Send input to agent',
  resumeAgent: 'Resume agent',
  wait: 'Wait for agent',
  closeAgent: 'Close agent',
};

const activityLabels: Record<NonNullable<TurnItem['activityKind']>, string> = {
  started: 'Start agent',
  interacted: 'Send input to agent',
  interrupted: 'Interrupt agent',
};

const stateLabels: Record<
  NonNullable<NonNullable<TurnItem['agentsStates']>[string]['status']>,
  string
> = {
  pendingInit: 'starting',
  running: 'running',
  interrupted: 'interrupted',
  completed: 'completed',
  errored: 'errored',
  shutdown: 'shut down',
  notFound: 'not found',
};

export function CollabAgentItem({ item }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(!item.completed);
  const activity = item.type === 'subAgentActivity';
  const tool = item.collabTool ?? 'spawnAgent';
  const states = Object.entries(item.agentsStates ?? {});
  const childThreadIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of item.receiverThreadIds ?? []) ids.add(id);
    for (const [id] of states) ids.add(id);
    if (item.agentThreadId) ids.add(item.agentThreadId);
    return [...ids];
  }, [item.agentThreadId, item.receiverThreadIds, states]);
  const threadsById = useTimelineStore((state) => state.threadsById);
  const childProgress = useMemo(
    () =>
      childThreadIds.map((threadId) => {
        const runtime = threadsById[threadId];
        const workItems = (runtime?.timeline ?? [])
          .filter((entry) => entry.kind === 'turn')
          .flatMap((entry) => entry.items)
          .filter((workItem) => {
            if (workItem.type === 'agentMessage')
              return workItem.content.trim();
            if (workItem.type === 'reasoning') return workItem.content.trim();
            if (workItem.type === 'commandExecution') {
              return Boolean(workItem.command || workItem.content.trim());
            }
            if (workItem.type === 'fileChange')
              return Boolean(workItem.filePath);
            if (workItem.type === 'mcpToolCall')
              return Boolean(workItem.toolName);
            return false;
          });
        const recent = workItems.slice(-3).map((workItem) => {
          if (workItem.type === 'agentMessage') return workItem.content.trim();
          if (workItem.type === 'reasoning') return workItem.content.trim();
          if (workItem.type === 'commandExecution') {
            return workItem.command
              ? `$ ${workItem.command}`
              : workItem.content.trim();
          }
          if (workItem.type === 'fileChange') {
            return `${workItem.filePath ?? 'file'} changed`;
          }
          return `${workItem.toolServer ?? 'MCP'}/${workItem.toolName ?? 'tool'}`;
        });
        return {
          threadId,
          running: Boolean(runtime?.loading || runtime?.activeTurnId),
          recent,
        };
      }),
    [childThreadIds, threadsById],
  );
  const hasDetails = Boolean(
    item.prompt ||
    item.model ||
    item.reasoningEffort ||
    states.length ||
    item.agentThreadId ||
    item.agentPath,
  );
  const failed = item.collabStatus === 'failed';
  const openAgentThread = (threadId: string) => {
    void navigate({ to: '/t/$threadId', params: { threadId } });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30">
      <button
        type="button"
        aria-expanded={open}
        disabled={!hasDetails}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors',
          hasDetails && 'cursor-pointer hover:bg-muted/50',
        )}
      >
        {hasDetails && (
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 transition-transform duration-200',
              open && 'rotate-90',
            )}
          />
        )}
        <Bot className="h-3.5 w-3.5 shrink-0 text-blue-400" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {t(
            activity
              ? activityLabels[item.activityKind ?? 'started']
              : toolLabels[tool],
          )}
        </span>
        {failed ? (
          <span className="flex shrink-0 items-center gap-1 text-red-400">
            <CircleAlert className="h-3 w-3" />
            {t('failed')}
          </span>
        ) : item.completed ? (
          <span className="flex shrink-0 items-center gap-1 text-green-500">
            <CheckCircle2 className="h-3 w-3" />
            {t('done')}
          </span>
        ) : (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        )}
      </button>

      {open && hasDetails && (
        <div className="space-y-2 border-t border-border/30 px-3 py-2 text-xs text-muted-foreground">
          {item.prompt && (
            <div>
              <div className="mb-1 font-medium text-foreground/80">
                {t('Prompt')}
              </div>
              <div className="whitespace-pre-wrap break-words rounded bg-muted/40 px-2 py-1.5">
                {item.prompt}
              </div>
            </div>
          )}
          {activity && (item.agentPath || item.agentThreadId) && (
            <div className="space-y-1">
              {item.agentPath && (
                <div className="break-all">
                  {t('Agent path')}:{' '}
                  <span className="text-foreground/80">{item.agentPath}</span>
                </div>
              )}
              {item.agentThreadId && (
                <div className="break-all">
                  {t('Agent thread')}:{' '}
                  <span className="font-mono text-[11px] text-foreground/80">
                    {item.agentThreadId}
                  </span>
                </div>
              )}
            </div>
          )}
          {(item.model || item.reasoningEffort) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {item.model && (
                <span>
                  {t('Model')}:{' '}
                  <span className="text-foreground/80">{item.model}</span>
                </span>
              )}
              {item.reasoningEffort && (
                <span>
                  {t('Reasoning effort')}:{' '}
                  <span className="text-foreground/80">
                    {item.reasoningEffort}
                  </span>
                </span>
              )}
            </div>
          )}
          {states.length > 0 && (
            <div className="space-y-1">
              {states.map(([threadId, state]) => (
                <div
                  key={threadId}
                  className="flex min-w-0 items-start gap-2 rounded bg-muted/40 px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground/70">
                    {threadId}
                  </span>
                  <span
                    className={cn(
                      'shrink-0',
                      state.status === 'errored' || state.status === 'notFound'
                        ? 'text-red-400'
                        : state.status === 'completed'
                          ? 'text-green-500'
                          : 'text-muted-foreground',
                    )}
                  >
                    {t(stateLabels[state.status])}
                  </span>
                  {state.message && (
                    <span className="min-w-0 break-words text-foreground/70">
                      {state.message}
                    </span>
                  )}
                  <button
                    type="button"
                    className="shrink-0 text-primary hover:underline"
                    onClick={() => openAgentThread(threadId)}
                  >
                    {t('Open agent thread')}
                  </button>
                </div>
              ))}
            </div>
          )}
          {states.length === 0 &&
            item.receiverThreadIds &&
            item.receiverThreadIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.receiverThreadIds.map((threadId) => (
                  <button
                    key={threadId}
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => openAgentThread(threadId)}
                  >
                    {t('Open agent thread')} ({threadId})
                  </button>
                ))}
              </div>
            )}
          {childProgress.some(
            (child) => child.recent.length > 0 || child.running,
          ) && (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground/80">
                {t('Agent work')}
              </div>
              {childProgress.map((child) => (
                <div
                  key={child.threadId}
                  className="rounded bg-muted/40 px-2 py-1.5"
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    {child.running && (
                      <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/70">
                      {child.threadId}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-primary hover:underline"
                      onClick={() => openAgentThread(child.threadId)}
                    >
                      {t('Open agent thread')}
                    </button>
                  </div>
                  {child.recent.map((line, index) => (
                    <div
                      key={`${child.threadId}-${index}`}
                      className="line-clamp-3 whitespace-pre-wrap break-words border-t border-border/20 py-1 text-foreground/70"
                    >
                      {line.length > 400 ? `${line.slice(0, 400)}…` : line}
                    </div>
                  ))}
                  {child.running && child.recent.length === 0 && (
                    <div className="border-t border-border/20 py-1 text-foreground/60">
                      {t('Waiting for agent output...')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

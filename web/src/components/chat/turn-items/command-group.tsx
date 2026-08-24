/** Collapsible container for consecutive command and file-change activity. */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ChevronRight, FilePenLine, Loader2, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TurnItem } from '@/types/timeline';
import { cn } from '@/lib/utils';

interface Props {
  items: TurnItem[];
  hasPendingRequest: boolean;
  children: ReactNode;
}

export function ActivityGroup({ items, hasPendingRequest, children }: Props) {
  const { t } = useTranslation();
  const allCompleted = items.every((item) => item.completed);
  const commandCount = items.filter(
    (item) => item.type === 'commandExecution',
  ).length;
  const fileCount = items.filter((item) => item.type === 'fileChange').length;
  const failedCount = items.filter(
    (item) =>
      item.completed && item.exitCode !== undefined && item.exitCode !== 0,
  ).length;
  const [open, setOpen] = useState(hasPendingRequest);
  const prevHasPendingRequest = useRef(hasPendingRequest);

  useEffect(() => {
    if (hasPendingRequest && !prevHasPendingRequest.current) setOpen(true);
    if (!hasPendingRequest && prevHasPendingRequest.current) setOpen(false);
    prevHasPendingRequest.current = hasPendingRequest;
  }, [hasPendingRequest]);

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-full items-center gap-2 px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
        {commandCount > 0 ? (
          <Terminal className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <FilePenLine className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {commandCount > 0 &&
            t(commandCount === 1 ? '{{count}} command' : '{{count}} commands', {
              count: commandCount,
            })}
          {commandCount > 0 && fileCount > 0 && ', '}
          {fileCount > 0 &&
            t(
              fileCount === 1
                ? '{{count}} file changed'
                : '{{count}} files changed',
              { count: fileCount },
            )}
        </span>
        {!allCompleted && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
        {allCompleted && failedCount === 0 && (
          <span className="shrink-0 text-green-500">{t('done')}</span>
        )}
        {failedCount > 0 && (
          <span className="shrink-0 text-red-500">
            {t('{{count}} failed', { count: failedCount })}
          </span>
        )}
      </button>

      {open && <div className="space-y-2 px-3 pb-2 pt-1">{children}</div>}
    </div>
  );
}

/**
 * Renders a command execution item collapsed to one summary line by default.
 * Full commands and streaming output remain available on explicit expansion.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TurnItem } from '@/types/timeline';
import { cn } from '@/lib/utils';

interface Props {
  item: TurnItem;
}

export function CommandItem({ item }: Props) {
  const { t } = useTranslation();
  const fullCommand = item.command
    ? stripShellWrapper(item.command)
    : undefined;
  const [expanded, setExpanded] = useState(false);

  /** First logical line for the collapsed preview. */
  const previewLine = (fullCommand ?? item.content ?? t('Terminal'))
    .split('\n')[0]
    .trim();
  const hasDetails = Boolean(fullCommand || item.content);

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/40 font-mono">
      <button
        type="button"
        disabled={!hasDetails}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          'flex h-8 w-full items-center gap-1.5 px-3 text-left text-xs text-muted-foreground',
          expanded && 'border-b border-border/50',
          hasDetails && 'hover:bg-muted/60 hover:text-foreground',
        )}
        title={fullCommand}
      >
        {hasDetails &&
          (expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          ))}
        <Terminal className="h-3 w-3" />
        <span className="min-w-0 flex-1 truncate">
          {previewLine || t('Terminal')}
        </span>
        {item.exitCode !== undefined && item.completed && (
          <span
            className={cn(
              'shrink-0',
              item.exitCode === 0 ? 'text-green-400' : 'text-red-400',
            )}
          >
            {t('exit')} {item.exitCode}
          </span>
        )}
        {!item.completed && (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        )}
      </button>

      {expanded && (
        <>
          {fullCommand && (
            <div className="border-b border-border/30 bg-muted/60 px-3 py-1.5 text-xs text-foreground/80">
              <span className="mr-1.5 text-green-400">$</span>
              <span className="whitespace-pre-wrap break-all">
                {fullCommand}
              </span>
            </div>
          )}

          {item.content && (
            <pre className="m-0 max-h-64 overflow-auto p-3 text-xs leading-relaxed text-muted-foreground">
              {item.content}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Strips the shell invocation wrapper added by Codex.
 * e.g. `/bin/zsh -lc "mkdir -p .claude && ..."` → `mkdir -p .claude && ...`
 * Never truncates — returns the full inner command.
 */
function stripShellWrapper(cmd: string): string {
  const match = cmd.match(/^\/bin\/(?:zsh|bash)\s+-\w+\s+"([\s\S]+)"$/);
  return match ? match[1] : cmd;
}

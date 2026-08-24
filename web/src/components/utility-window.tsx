import type { ReactNode } from 'react';
import { FolderOpen, Minimize2, Puzzle, Settings, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type UtilityWindowKind = 'files' | 'terminal' | 'settings' | 'integrations';

interface Props {
  kind: UtilityWindowKind;
  onHide: () => void;
  children: ReactNode;
  visible: boolean;
}

const WINDOW_DETAILS = {
  files: { label: 'Files', icon: FolderOpen },
  terminal: { label: 'Terminal', icon: Terminal },
  settings: { label: 'Settings', icon: Settings },
  integrations: { label: 'Integrations', icon: Puzzle },
} as const;

/** Shared top-level shell for app tools that temporarily cover the workspace. */
export function UtilityWindow({ kind, onHide, children, visible }: Props) {
  const { t } = useTranslation();
  const details = WINDOW_DETAILS[kind];
  const Icon = details.icon;

  return (
    <section
      data-utility-window={visible ? kind : undefined}
      className={cn(
        'fixed inset-0 z-[100] flex flex-col bg-background text-foreground',
        !visible && 'hidden',
      )}
      aria-label={t(details.label)}
      aria-hidden={!visible}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {t(details.label)}
        </h1>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={onHide}
          title={t('Hide window')}
        >
          <Minimize2 className="h-3.5 w-3.5" />
          {t('Hide window')}
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </section>
  );
}

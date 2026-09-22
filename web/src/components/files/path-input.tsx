import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { File, Folder, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { filesReadTreeOptions } from '@/generated/api/@tanstack/react-query.gen';
import type { FileEntryDto } from '@/generated/api/types.gen';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

/** Completes one directory at a time using the same permissions as the file tree. */
export function PathInput({ value, onChange, disabled, invalid }: Props) {
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const path = value.trimStart();
  const slash = path.lastIndexOf('/');
  const directory = slash < 0 ? '.' : path.slice(0, slash) || '/';
  const prefix = path.slice(slash + 1);
  const [queryDirectory, setQueryDirectory] = useState(directory);

  // Filtering within a directory is instant; changing directories is debounced.
  useEffect(() => {
    const timer = window.setTimeout(() => setQueryDirectory(directory), 180);
    return () => window.clearTimeout(timer);
  }, [directory]);

  const query = useQuery({
    ...filesReadTreeOptions({ query: { root: queryDirectory } }),
    enabled: open && !disabled && Boolean(path) && queryDirectory === directory,
    retry: false,
    staleTime: 10_000,
  });
  const waiting = directory !== queryDirectory || query.isPending;
  const entries = waiting || query.isError ? [] : (query.data ?? [])
    .filter((entry) => entry.name.startsWith(prefix))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 50);
  const visible = open && !disabled && Boolean(path);
  const active = visible ? entries[activeIndex] : undefined;

  useEffect(() => {
    if (active) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [active, activeIndex]);

  const choose = (entry: FileEntryDto) => {
    onChange(entry.type === 'directory' ? `${entry.path.replace(/\/+$/, '')}/` : entry.path);
    setActiveIndex(-1);
    setOpen(entry.type === 'directory');
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && visible) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            if (entries.length) setActiveIndex((index) => event.key === 'ArrowDown'
              ? (index + 1) % entries.length
              : (index < 0 ? entries.length - 1 : (index - 1 + entries.length) % entries.length));
          } else if (visible && ((event.key === 'Enter' && active) || (event.key === 'Tab' && !event.shiftKey && entries.length))) {
            event.preventDefault();
            choose(active ?? entries[0]);
          }
        }}
        role="combobox"
        aria-label={t('Open path')}
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={active ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={invalid}
        placeholder={t('Enter file or directory path...')}
        autoFocus
        spellCheck={false}
        autoComplete="off"
      />
      {visible && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          <div ref={listRef} id={listId} role="listbox" aria-label={t('Path suggestions')} className="max-h-48 overflow-y-auto py-1">
            {entries.map((entry, index) => (
              <div
                key={entry.path}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(entry)}
                className={cn('flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent', index === activeIndex && 'bg-accent text-accent-foreground')}
              >
                {entry.type === 'directory' ? <Folder className="h-4 w-4 shrink-0" /> : <File className="h-4 w-4 shrink-0" />}
                <span className="truncate">{entry.name}{entry.type === 'directory' ? '/' : ''}</span>
              </div>
            ))}
          </div>
          {!entries.length && (
            <div role="status" className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              {waiting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('Loading...')}</>
                : query.isError ? t('Unable to load path suggestions') : t('No matching files')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

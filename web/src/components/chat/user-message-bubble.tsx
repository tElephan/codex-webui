/**
 * User message bubble with markdown rendering, clickable @mentions, and image badges.
 * Uses react-markdown + remark-gfm + custom remark-mentions plugin.
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, FileText, ImageIcon, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { openFileInPanel } from '@/lib/local-file-link';
import { remarkMentions } from '@/lib/remark-mentions';
import { normalizeMessageMentions } from '@/lib/mention-utils';

interface Props {
  content: string;
  threadCwd: string | null;
  images?: string[];
  editing?: boolean;
  editPending?: boolean;
  onCancelEdit?: () => void;
  onSaveEdit?: (content: string) => void;
}

/** Allow `mention:` scheme through react-markdown's URL sanitizer. */
function userUrlTransform(url: string): string {
  if (url.startsWith('mention:')) return url;
  return defaultUrlTransform(url);
}

/**
 * Markdown component overrides for user message bubbles (white-on-blue).
 * Links with `mention:` scheme render as clickable file badges;
 * regular links open in a new tab.
 */
const userComponents: ComponentProps<typeof Markdown>['components'] = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="text-sm">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-white/30 pl-3 italic text-white/70">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    // Mention links → clickable file badge
    if (href?.startsWith('mention:')) {
      const absolutePath = href.slice('mention:'.length);
      return (
        <span
          role="button"
          tabIndex={0}
          onClick={() => openFileInPanel(absolutePath)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openFileInPanel(absolutePath);
            }
          }}
          className="inline-flex cursor-pointer items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 font-mono text-[0.85em] transition-colors hover:bg-white/25"
        >
          <FileText className="inline h-3 w-3 opacity-70" />
          {children}
        </span>
      );
    }
    // Regular links
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
        {children}
      </a>
    );
  },
  code: ({ className, children, ...rest }) => {
    const isBlock = className?.startsWith('language-') || String(children).includes('\n');
    if (isBlock) {
      return (
        <pre className="my-2 overflow-auto rounded bg-black/30 p-3 text-sm leading-relaxed">
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[0.85em]" {...rest}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  hr: () => <hr className="my-3 border-white/20" />,
};

export function UserMessageBubble({
  content,
  threadCwd,
  images,
  editing = false,
  editPending = false,
  onCancelEdit,
  onSaveEdit,
}: Props) {
  const { t } = useTranslation();
  const [editContent, setEditContent] = useState(content);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => {
      setEditContent(content);
      editTextareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [content, editing]);

  const saveEdit = () => {
    if (editPending || editContent.trim().length === 0) return;
    onSaveEdit?.(editContent);
  };

  const handleEditKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelEdit?.();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      saveEdit();
    }
  };

  // Normalize absolute @mentions to relative before rendering
  const normalizedContent = useMemo(
    () => normalizeMessageMentions(content, threadCwd),
    [content, threadCwd],
  );

  // Memoize remark plugins array (stable reference prevents re-renders)
  const remarkPlugins = useMemo(
    () => [remarkGfm, remarkMentions(threadCwd)],
    [threadCwd],
  );

  // Filter out direct URLs — only server paths are openable
  const imageFiles = images?.filter((src) => !/^(https?|data|blob):/.test(src));

  return (
    <div className="text-sm leading-relaxed [overflow-wrap:break-word]">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            ref={editTextareaRef}
            value={editContent}
            onChange={(event) => setEditContent(event.target.value)}
            onKeyDown={handleEditKeyDown}
            disabled={editPending}
            aria-label={t('Edit message')}
            className="min-h-20 resize-y border-white/30 bg-white text-slate-900 placeholder:text-slate-500 focus-visible:border-white focus-visible:ring-white/40 dark:bg-white"
          />
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={editPending}
              aria-label={t('Cancel editing')}
              title={t('Cancel editing')}
              onClick={onCancelEdit}
              className="text-white hover:bg-white/15 hover:text-white"
            >
              <X />
              <span className="sr-only">{t('Cancel editing')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={editPending || editContent.trim().length === 0}
              aria-label={t('Save message')}
              title={t('Save message')}
              onClick={saveEdit}
              className="text-white hover:bg-white/15 hover:text-white"
            >
              {editPending ? <Loader2 className="animate-spin" /> : <Check />}
              <span className="sr-only">{t('Save message')}</span>
            </Button>
          </div>
        </div>
      ) : (
        <Markdown remarkPlugins={remarkPlugins} components={userComponents} urlTransform={userUrlTransform}>
          {normalizedContent}
        </Markdown>
      )}

      {imageFiles && imageFiles.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {imageFiles.map((src, i) => (
            <span
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => openFileInPanel(src)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openFileInPanel(src);
                }
              }}
              className="inline-flex cursor-pointer items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 font-mono text-[0.85em] transition-colors hover:bg-white/25"
            >
              <ImageIcon className="inline h-3 w-3 opacity-70" />
              {src.split('/').pop() ?? src}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

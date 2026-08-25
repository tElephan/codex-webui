import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  Loader2,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  queuedTurnAttachmentCount,
  type QueuedTurn,
  useQueuedTurnStore,
} from '@/stores/queued-turn-store';

const EMPTY_QUEUE: QueuedTurn[] = [];

interface Props {
  threadId: string | null;
  canSendNow: boolean;
  onSendNow: (item: QueuedTurn) => void;
}

export function QueuedTurnList({ threadId, canSendNow, onSendNow }: Props) {
  const { t } = useTranslation();
  const queue = useQueuedTurnStore((state) =>
    threadId ? (state.queues[threadId] ?? EMPTY_QUEUE) : EMPTY_QUEUE,
  );
  const remove = useQueuedTurnStore((state) => state.remove);
  const updateText = useQueuedTurnStore((state) => state.updateText);
  const move = useQueuedTurnStore((state) => state.move);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  if (!threadId || queue.length === 0) return null;

  return (
    <section className="mb-2 overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-sm backdrop-blur-sm">
      <div className="flex h-8 items-center gap-2 border-b border-border/60 px-2.5 text-xs font-medium text-foreground">
        <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{t('Queued messages ({{count}})', { count: queue.length })}</span>
      </div>
      <div className="max-h-40 divide-y divide-border/50 overflow-y-auto">
        {queue.map((item, index) => {
          const attachmentCount = queuedTurnAttachmentCount(item);
          const isEditing = editingId === item.id;
          const isSending = item.status === 'sending';
          const canSave = editText.trim().length > 0 || attachmentCount > 0;

          return (
            <div
              key={item.id}
              className="flex min-w-0 items-start gap-2 px-2 py-1.5"
            >
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <Textarea
                    autoFocus
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    rows={2}
                    className="min-h-12 resize-none text-xs"
                  />
                ) : (
                  <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                    {item.displayText ||
                      t(
                        attachmentCount === 1
                          ? '1 attachment'
                          : '{{count}} attachments',
                        { count: attachmentCount },
                      )}
                  </p>
                )}
                {attachmentCount > 0 && item.displayText && !isEditing && (
                  <p className="text-[10px] text-muted-foreground">
                    {t(
                      attachmentCount === 1
                        ? '1 attachment'
                        : '{{count}} attachments',
                      { count: attachmentCount },
                    )}
                  </p>
                )}
                {item.status === 'failed' && item.error && !isEditing && (
                  <p
                    className="truncate text-[10px] text-destructive"
                    title={item.error}
                  >
                    {item.error}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                {isEditing ? (
                  <>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={!canSave}
                      aria-label={t('Save queued message')}
                      title={t('Save queued message')}
                      onClick={() => {
                        updateText(threadId, item.id, editText);
                        setEditingId(null);
                      }}
                    >
                      <Check />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t('Cancel editing')}
                      title={t('Cancel editing')}
                      onClick={() => setEditingId(null)}
                    >
                      <X />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={!canSendNow || isSending}
                      aria-label={t('Send queued message now')}
                      title={t('Send queued message now')}
                      onClick={() => onSendNow(item)}
                    >
                      {isSending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Send />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={isSending}
                      aria-label={t('Edit queued message')}
                      title={t('Edit queued message')}
                      onClick={() => {
                        setEditingId(item.id);
                        setEditText(item.displayText);
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={index === 0 || isSending}
                      aria-label={t('Move queued message up')}
                      title={t('Move queued message up')}
                      onClick={() => move(threadId, item.id, -1)}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={index === queue.length - 1 || isSending}
                      aria-label={t('Move queued message down')}
                      title={t('Move queued message down')}
                      onClick={() => move(threadId, item.id, 1)}
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={isSending}
                      aria-label={t('Delete queued message')}
                      title={t('Delete queued message')}
                      onClick={() => remove(threadId, item.id)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Renders attachment chips above the ChatInput textarea. */
import { X, FileText, Image, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { unescapeMentionPath } from '@/lib/mention-utils';
import type { ChatAttachment, ChatImageAttachment } from '@/types/attachments';

interface Props {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
  className?: string;
}

export function AttachmentChips({ attachments, onRemove, className }: Props) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5 px-3 pb-1.5 pt-2', className)}>
      {attachments.map((att) => (
        <ChipItem
          key={att.id}
          attachment={att}
          onRemove={() => onRemove(att.id)}
        />
      ))}
    </div>
  );
}

function ChipItem({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const name =
    attachment.type === 'mention'
      ? unescapeMentionPath(attachment.displayName)
      : attachment.name;
  const icon = chipIcon(attachment);
  const isImage = attachment.type === 'localImage' && attachment.previewUrl;

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/50 px-2 py-1',
        'text-xs text-foreground transition-colors hover:bg-muted/80',
      )}
    >
      {isImage ? (
        <img
          src={(attachment as ChatImageAttachment).previewUrl}
          alt={(attachment as ChatImageAttachment).name}
          className="h-5 w-5 rounded object-cover"
        />
      ) : (
        <span className="text-muted-foreground">{icon}</span>
      )}
      <span className="max-w-[140px] truncate">{name}</span>
      <button
        type="button"
        aria-label={t('Remove attachment: {{name}}', { name })}
        onClick={onRemove}
        className="ml-0.5 flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function chipIcon(att: ChatAttachment) {
  switch (att.type) {
    case 'localImage':
      return <Image className="h-3.5 w-3.5" />;
    case 'skill':
      return <Zap className="h-3.5 w-3.5" />;
    case 'mention':
      return <FileText className="h-3.5 w-3.5" />;
  }
}

import type { TurnItem } from '@/types/timeline';
import { MarkdownRenderer } from '../markdown-renderer';
import { AsyncUserInputCard } from './async-user-input-card';

interface Props {
  item: TurnItem;
}

export function AgentMessageItem({ item }: Props) {
  return (
    <div className="space-y-2">
      <MarkdownRenderer content={item.content} completed={item.completed} />
      {!!item.questions?.length && (
        <AsyncUserInputCard itemId={item.itemId} questions={item.questions} />
      )}
    </div>
  );
}

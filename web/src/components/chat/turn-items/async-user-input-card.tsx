import { useTimelineStore } from '@/stores/timeline-store';
import { useAsyncUserInputStore } from '@/stores/async-user-input-store';
import { submitAsyncUserInput } from '@/lib/submit-async-user-input';
import type { UserInputQuestion } from '@/types/approval';
import { UserInputForm } from './user-input-form';

export function AsyncUserInputCard({
  itemId,
  questions,
}: {
  itemId: string;
  questions: UserInputQuestion[];
}) {
  const threadId = useTimelineStore((state) => state.threadId);
  const threadMode = useTimelineStore((state) => state.threadMode);
  const key = JSON.stringify([threadId, itemId]);
  const answers = useAsyncUserInputStore((state) => state.answers[key]);
  return (
    <UserInputForm
      key={key}
      questions={questions}
      resolved={!!answers}
      disabled={!threadId || threadMode !== 'live'}
      submittedAnswers={answers}
      onSubmit={(result) =>
        submitAsyncUserInput(threadId!, itemId, questions, result)
      }
    />
  );
}

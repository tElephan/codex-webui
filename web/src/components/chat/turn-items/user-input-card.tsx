/** Renders an app-server item/tool/requestUserInput card for structured user input. */
import { pendingApprovalsRespond } from '@/generated/api/sdk.gen';
import { useTimelineStore } from '@/stores/timeline-store';
import type { UserInputRequest } from '@/types/approval';
import { UserInputForm } from './user-input-form';

export function UserInputCard({ request }: { request: UserInputRequest }) {
  return (
    <div data-request-id={String(request.requestId)}>
      <UserInputForm
        questions={request.questions}
        resolved={request.status !== 'pending'}
        onSubmit={async (answers) => {
          await pendingApprovalsRespond({
            path: { requestId: String(request.requestId) },
            body: { result: { answers } },
            throwOnError: true,
          });
          useTimelineStore
            .getState()
            .resolveUserInputRequestForThread(
              request.threadId,
              request.requestId,
            );
        }}
      />
    </div>
  );
}

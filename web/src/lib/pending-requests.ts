import type { PendingServerRequestDto } from '@/generated/api';
import type { ApprovalRequest } from '@/types/approval';
import {
  parseAvailableDecisions,
  parseStringArray,
  parseNetworkAmendments,
} from './approval-parsers';

export function approvalFromPending(
  request: PendingServerRequestDto,
): ApprovalRequest | null {
  const params = request.params;
  const turnId =
    typeof params.turnId === 'string' ? params.turnId : request.turnId;
  const itemId =
    typeof params.itemId === 'string' ? params.itemId : request.itemId;
  if (!turnId || !itemId || request.status !== 'pending') return null;

  if (request.method === 'item/commandExecution/requestApproval') {
    return {
      requestId: request.requestId,
      kind: 'commandExecution',
      threadId: request.threadId,
      turnId,
      itemId,
      status: 'pending',
      command: (params.command as string) ?? null,
      cwd: (params.cwd as string) ?? null,
      reason: (params.reason as string) ?? null,
      availableDecisions: parseAvailableDecisions(params.availableDecisions),
      proposedExecpolicyAmendment: parseStringArray(
        params.proposedExecpolicyAmendment,
      ),
      proposedNetworkPolicyAmendments: parseNetworkAmendments(
        params.proposedNetworkPolicyAmendments,
      ),
    };
  }

  if (request.method === 'item/fileChange/requestApproval') {
    return {
      requestId: request.requestId,
      kind: 'fileChange',
      threadId: request.threadId,
      turnId,
      itemId,
      status: 'pending',
      reason: (params.reason as string) ?? null,
      grantRoot: (params.grantRoot as string) ?? null,
    };
  }

  return null;
}

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-codes';
import { ThreadDeletionRegistryService } from '../thread-deletion/thread-deletion-registry.service';
import { ThreadResumeRegistryService } from './thread-resume-registry.service';
import { ThreadsService } from './threads.service';
import { ThreadWriterService } from './thread-writer.service';
import { sameThreadWriter, ThreadWriter } from './thread-writer-inspector';
import { ThreadTakeoverPreviewDto } from './dto/thread-takeover.dto';

interface TakeoverConfirmation {
  threadId: string;
  owner: ThreadWriter | null;
  expiresAt: number;
}

@Injectable()
export class ThreadTakeoverService {
  private readonly confirmations = new Map<string, TakeoverConfirmation>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly threads: ThreadsService,
    private readonly writers: ThreadWriterService,
    private readonly resumes: ThreadResumeRegistryService,
    private readonly deletions: ThreadDeletionRegistryService,
  ) {}

  async preview(threadId: string): Promise<ThreadTakeoverPreviewDto> {
    this.deletions.assertMutable(threadId);
    await this.threads.readThread(threadId);
    const owner = await this.inspect(threadId);
    for (const [key, value] of this.confirmations) {
      if (value.expiresAt <= Date.now()) this.confirmations.delete(key);
    }
    if (this.confirmations.size >= 100) {
      const oldest = this.confirmations.keys().next();
      if (!oldest.done) this.confirmations.delete(oldest.value);
    }
    const confirmationToken = randomUUID();
    this.confirmations.set(confirmationToken, {
      threadId,
      owner,
      expiresAt: Date.now() + 60_000,
    });
    return {
      threadId,
      ownerPid: owner?.pid ?? null,
      affectedThreadIds: owner?.threadIds ?? [],
      confirmationToken,
    };
  }

  async takeover(threadId: string, token: string) {
    const confirmation = this.confirmations.get(token);
    if (
      !confirmation ||
      confirmation.threadId !== threadId ||
      confirmation.expiresAt <= Date.now()
    ) {
      throw BusinessException.conflict(
        ErrorCode.threads.takeoverChanged,
        'Takeover confirmation expired; refresh the preview',
      );
    }
    this.confirmations.delete(token);
    this.deletions.assertMutable(threadId);
    if (this.inFlight.has(threadId)) {
      throw BusinessException.conflict(
        ErrorCode.threads.takeoverChanged,
        'A takeover is already in progress',
      );
    }
    this.inFlight.add(threadId);
    try {
      const current = await this.inspect(threadId);
      if (current && !sameThreadWriter(current, confirmation.owner)) {
        throw BusinessException.conflict(
          ErrorCode.threads.takeoverChanged,
          'The writer or affected conversations changed; refresh the preview',
        );
      }
      if (current) {
        for (const affectedId of current.threadIds)
          this.deletions.assertMutable(affectedId);
        try {
          await this.writers.stop(threadId, current);
        } catch (error) {
          throw BusinessException.conflict(
            ErrorCode.threads.takeoverUnavailable,
            error instanceof Error
              ? error.message
              : 'Cannot stop the other Codex client',
          );
        }
      }
      this.resumes.forget(threadId);
      return await this.threads.resumeThread(threadId);
    } finally {
      this.inFlight.delete(threadId);
    }
  }

  private async inspect(threadId: string) {
    try {
      return await this.writers.inspect(threadId);
    } catch (error) {
      throw BusinessException.conflict(
        ErrorCode.threads.takeoverUnavailable,
        error instanceof Error
          ? error.message
          : 'Cannot identify the other Codex client',
      );
    }
  }
}

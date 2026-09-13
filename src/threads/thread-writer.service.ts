/** Stops only a writer whose process identity and affected conversations were confirmed. */
import { Injectable } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import { CodexProcessManager } from '../codex/codex-process-manager.service';
import {
  inspectThreadWriter,
  sameThreadWriter,
  ThreadWriter,
  WriterInspectionError,
} from './thread-writer-inspector';

@Injectable()
export class ThreadWriterService {
  constructor(private readonly manager: CodexProcessManager) {}

  inspect(threadId: string): Promise<ThreadWriter | null> {
    const codexHome = this.manager.getInitResult()?.codexHome;
    if (!codexHome)
      throw new WriterInspectionError('Codex app-server is not connected');
    return inspectThreadWriter(codexHome, threadId);
  }

  async stop(threadId: string, expected: ThreadWriter): Promise<void> {
    const current = await this.inspect(threadId);
    if (!current) return;
    if (!sameThreadWriter(current, expected)) {
      throw new WriterInspectionError(
        'The thread writer changed; refresh the takeover preview',
      );
    }
    try {
      process.kill(current.pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    // Never unlink a locked file: doing so lets two recorders write simultaneously.
    for (let attempt = 0; attempt < 50; attempt++) {
      await setTimeout(100);
      const writer = await this.inspect(threadId);
      if (!writer) return;
      if (!sameThreadWriter(writer, expected)) {
        throw new WriterInspectionError(
          'Another client acquired the conversation; retry takeover',
        );
      }
    }
    throw new WriterInspectionError(
      'The other Codex client did not release the conversation; close it and retry',
    );
  }
}

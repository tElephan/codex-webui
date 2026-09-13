import { ThreadResumeRegistryService } from './thread-resume-registry.service';
import type { v2 } from '../codex/codex-schema';

describe('ThreadResumeRegistryService response compatibility', () => {
  const codex = { request: jest.fn() };
  const manager = {
    getGeneration: jest.fn(() => 1),
    addLifecycleListener: jest.fn(),
  };
  let registry: ThreadResumeRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ThreadResumeRegistryService(
      codex as never,
      manager as never,
    );
  });

  it.each(['start', 'fork'] as const)(
    'accepts a %s response without resume-only cursors',
    async () => {
      const thread = { id: 'thread1', cwd: '/workspace', turns: [] };
      const response = {
        thread,
        model: 'gpt-6-astra',
        modelProvider: 'openai',
        serviceTier: null,
        cwd: '/workspace',
        instructionSources: [],
        approvalPolicy: 'never',
        approvalsReviewer: 'user',
        sandbox: { type: 'readOnly' },
        reasoningEffort: 'max',
      } as v2.ThreadStartResponse | v2.ThreadForkResponse;
      registry.markResumed(thread.id);
      registry.cacheResponse(thread.id, response);
      codex.request.mockResolvedValue({ thread });

      await expect(registry.ensureResumed(thread.id)).resolves.toEqual({
        ...response,
        turnsBackwardsCursor: null,
        itemsBackwardsCursor: null,
      });
      expect(codex.request).toHaveBeenCalledTimes(1);
      expect(codex.request).toHaveBeenNthCalledWith(1, 'thread/read', {
        threadId: thread.id,
        includeTurns: false,
      });
    },
  );

  it('preserves initial resume cursors but clears them after a full read', async () => {
    const thread = { id: 'thread1', cwd: '/workspace', turns: [] };
    const response = {
      thread,
      model: 'gpt-6-astra',
      turnsBackwardsCursor: 'older-turn',
      itemsBackwardsCursor: 'older-item',
    };
    codex.request
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce({ thread })
      .mockResolvedValueOnce({ thread });

    await expect(registry.ensureResumed(thread.id)).resolves.toEqual({
      ...response,
      thread,
      turnsBackwardsCursor: null,
      itemsBackwardsCursor: null,
    });
    await expect(registry.ensureResumed(thread.id)).resolves.toEqual({
      ...response,
      thread,
      cwd: '/workspace',
      turnsBackwardsCursor: null,
      itemsBackwardsCursor: null,
    });
    expect(codex.request).toHaveBeenNthCalledWith(1, 'thread/resume', {
      threadId: thread.id,
      excludeTurns: true,
    });
    expect(codex.request).toHaveBeenNthCalledWith(3, 'thread/read', {
      threadId: thread.id,
      includeTurns: false,
    });
  });
});

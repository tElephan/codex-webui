import { Test, TestingModule } from '@nestjs/testing';
import { ThreadsService } from './threads.service';
import { CodexService } from '../codex/codex.service';
import { ThreadResumeRegistryService } from './thread-resume-registry.service';
import { ConversationBranchesService } from '../conversation-branches/conversation-branches.service';
import { ErrorCode } from '../common/error-codes';
import { CodexRpcError } from '../codex/codex-errors';
import { ThreadsBranchingService } from './threads-branching.service';

/** Branch state as the local-only service reports it for an untracked thread. */
function localBranchState(threadId: string) {
  return {
    threadId,
    treeRootThreadId: threadId,
    tracked: false,
    hasKnownDescendants: false,
    knownTreeThreadIds: [threadId],
  };
}

describe('ThreadsService', () => {
  let service: ThreadsService;
  const mockCodex = { request: jest.fn() };
  const mockResumeRegistry = {
    ensureResumed: jest.fn(),
    isResumed: jest.fn(),
    markResumed: jest.fn(),
    cacheResponse: jest.fn(),
    forget: jest.fn(),
  };
  const mockBranches = {
    attachPendingVersionTurn: jest.fn(),
    hasKnownDescendants: jest.fn(),
    listKnownTreeThreadIds: jest.fn(),
    listBranchTrees: jest.fn(),
    readBranchState: jest.fn(),
    readBranchTree: jest.fn(),
    recordMessageBranch: jest.fn(),
    resolveTreeRootThreadId: jest.fn(),
  };
  const mockBranching = {
    createMessageBranch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreadsService,
        { provide: CodexService, useValue: mockCodex },
        { provide: ThreadResumeRegistryService, useValue: mockResumeRegistry },
        { provide: ConversationBranchesService, useValue: mockBranches },
        { provide: ThreadsBranchingService, useValue: mockBranching },
      ],
    }).compile();

    service = module.get(ThreadsService);
    mockCodex.request.mockReset();
    Object.values(mockResumeRegistry).forEach((mock) => mock.mockReset());
    Object.values(mockBranches).forEach((mock) => mock.mockReset());
    mockBranching.createMessageBranch.mockReset();
    mockBranches.hasKnownDescendants.mockReturnValue(false);
    mockBranches.listKnownTreeThreadIds.mockImplementation(
      (threadId: string): string[] => [threadId],
    );
    mockBranches.resolveTreeRootThreadId.mockImplementation(
      (threadId: string): string => threadId,
    );
    mockResumeRegistry.isResumed.mockReturnValue(true);
  });

  it('starts new threads in paginated history mode', async () => {
    const response = {
      thread: { id: 't1', historyMode: 'paginated' },
      model: 'gpt-4',
    };
    mockCodex.request.mockResolvedValue(response);

    const result = await service.startThread({});

    expect(result).toEqual(response);
    expect(mockCodex.request).toHaveBeenCalledWith('thread/start', {
      historyMode: 'paginated',
    });
    expect(mockResumeRegistry.markResumed).toHaveBeenCalledWith('t1');
  });

  it('deletes a new thread when paginated history is not confirmed', async () => {
    mockCodex.request
      .mockResolvedValueOnce({ thread: { id: 't1', historyMode: 'legacy' } })
      .mockResolvedValueOnce({});

    await expect(service.startThread({})).rejects.toMatchObject({
      errorCode: ErrorCode.threads.paginatedHistoryRequired,
    });

    expect(mockCodex.request).toHaveBeenNthCalledWith(2, 'thread/delete', {
      threadId: 't1',
    });
    expect(mockResumeRegistry.markResumed).not.toHaveBeenCalled();
  });

  it('should call thread/list with params', async () => {
    mockCodex.request.mockResolvedValue({ data: [], nextCursor: null });

    await service.listThreads({ limit: 10 });

    expect(mockCodex.request).toHaveBeenCalledWith('thread/list', {
      limit: 10,
    });
  });

  it('should call thread/loaded/list with params', async () => {
    mockCodex.request.mockResolvedValue({ data: ['t1'], nextCursor: null });

    await service.listLoadedThreads({ cursor: 'cursor-1', limit: 20 });

    expect(mockCodex.request).toHaveBeenCalledWith('thread/loaded/list', {
      cursor: 'cursor-1',
      limit: 20,
    });
  });

  it('should call thread/read with includeTurns', async () => {
    mockCodex.request.mockResolvedValue({ thread: { id: 't1' } });

    await service.readThread('t1', true);

    expect(mockCodex.request).toHaveBeenCalledWith('thread/read', {
      threadId: 't1',
      includeTurns: true,
    });
  });

  it('returns empty turns for a new paginated thread without turn history', async () => {
    mockCodex.request
      .mockRejectedValueOnce(
        new CodexRpcError({
          code: -32601,
          message: 'list_turns is not supported yet',
        }),
      )
      .mockResolvedValueOnce({
        thread: { id: 't1', historyMode: 'paginated' },
      });

    await expect(service.readThread('t1', true)).resolves.toEqual({
      thread: { id: 't1', historyMode: 'paginated', turns: [] },
    });
    expect(mockCodex.request).toHaveBeenNthCalledWith(2, 'thread/read', {
      threadId: 't1',
      includeTurns: false,
    });
  });

  it('should ensure resume via registry', async () => {
    const response = { thread: { id: 't1' }, cwd: '/tmp' };
    mockResumeRegistry.ensureResumed.mockResolvedValue(response);

    await expect(service.resumeThread('t1')).resolves.toBe(response);
    expect(mockResumeRegistry.ensureResumed).toHaveBeenCalledWith('t1');
  });

  it('reports a conflict when another app-server owns the thread writer', async () => {
    mockResumeRegistry.ensureResumed.mockRejectedValue(
      new CodexRpcError({
        code: -32600,
        message: 'thread t1 already has an active writer',
        method: 'thread/resume',
      }),
    );

    await expect(service.resumeThread('t1')).rejects.toMatchObject({
      errorCode: ErrorCode.threads.activeWriter,
      params: { threadId: 't1' },
    });
  });

  it('should call turn/start', async () => {
    mockCodex.request.mockResolvedValue({ turn: { id: 'turn1' } });

    await service.startTurn({
      threadId: 't1',
      input: [{ type: 'text', text: 'hello' }] as never,
    });

    expect(mockCodex.request).toHaveBeenCalledWith('turn/start', {
      threadId: 't1',
      input: [{ type: 'text', text: 'hello' }],
    });
    expect(mockBranches.attachPendingVersionTurn).toHaveBeenCalledWith(
      't1',
      'turn1',
      'hello',
    );
  });

  it('resumes an unloaded thread before starting a turn', async () => {
    mockResumeRegistry.isResumed.mockReturnValue(false);
    mockResumeRegistry.ensureResumed.mockResolvedValue({
      thread: { id: 't1' },
      cwd: '/tmp',
    });
    mockCodex.request.mockResolvedValue({ turn: { id: 'turn1' } });

    await service.startTurn({
      threadId: 't1',
      input: [{ type: 'text', text: 'hello' }] as never,
    });

    expect(mockResumeRegistry.ensureResumed).toHaveBeenCalledWith('t1');
    expect(
      mockResumeRegistry.ensureResumed.mock.invocationCallOrder[0],
    ).toBeLessThan(mockCodex.request.mock.invocationCallOrder[0]);
  });

  it('does not start a turn when another app-server owns the writer', async () => {
    mockResumeRegistry.isResumed.mockReturnValue(false);
    mockResumeRegistry.ensureResumed.mockRejectedValue(
      new CodexRpcError({
        code: -32600,
        message: 'thread t1 already has an active writer',
        method: 'thread/resume',
      }),
    );

    await expect(
      service.startTurn({
        threadId: 't1',
        input: [{ type: 'text', text: 'hello' }] as never,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.threads.activeWriter });
    expect(mockCodex.request).not.toHaveBeenCalled();
  });

  it('forks an externally loaded legacy thread at its last completed turn', async () => {
    mockResumeRegistry.isResumed.mockReturnValue(false);
    mockCodex.request
      .mockResolvedValueOnce({
        thread: { id: 'source', historyMode: 'legacy' },
      })
      .mockResolvedValueOnce({
        thread: {
          id: 'source',
          historyMode: 'legacy',
          turns: [
            { id: 'done', status: 'completed' },
            { id: 'partial', status: 'interrupted' },
          ],
        },
      })
      .mockResolvedValueOnce({ thread: { id: 'fork' }, cwd: '/tmp' });

    await expect(service.forkThread('source')).resolves.toMatchObject({
      thread: { id: 'fork' },
    });
    expect(mockCodex.request).toHaveBeenNthCalledWith(3, 'thread/fork', {
      threadId: 'source',
      lastTurnId: 'done',
    });
  });

  it('should call turn/steer', async () => {
    mockCodex.request.mockResolvedValue({ turnId: 'turn1' });

    await service.steerTurn({
      threadId: 't1',
      expectedTurnId: 'turn1',
      input: [{ type: 'text', text: 'keep going' }] as never,
    });

    expect(mockCodex.request).toHaveBeenCalledWith('turn/steer', {
      threadId: 't1',
      expectedTurnId: 'turn1',
      input: [{ type: 'text', text: 'keep going' }],
    });
  });

  it('should call turn/interrupt', async () => {
    mockCodex.request.mockResolvedValue({});

    await service.interruptTurn('t1', 'turn1');

    expect(mockCodex.request).toHaveBeenCalledWith('turn/interrupt', {
      threadId: 't1',
      turnId: 'turn1',
    });
  });

  it('archives every locally tracked member of a branch tree', async () => {
    mockBranches.listKnownTreeThreadIds.mockReturnValue(['root', 'child']);
    mockCodex.request.mockResolvedValue({});

    await service.archiveThread('child');

    expect(mockCodex.request).toHaveBeenNthCalledWith(1, 'thread/archive', {
      threadId: 'root',
    });
    expect(mockCodex.request).toHaveBeenNthCalledWith(2, 'thread/archive', {
      threadId: 'child',
    });
    expect(mockResumeRegistry.forget).toHaveBeenCalledWith('root');
    expect(mockResumeRegistry.forget).toHaveBeenCalledWith('child');
  });

  it('attempts every tree member before reporting an archive failure', async () => {
    mockBranches.listKnownTreeThreadIds.mockReturnValue(['root', 'child']);
    mockCodex.request
      .mockRejectedValueOnce(new Error('root archive failed'))
      .mockResolvedValueOnce({});

    await expect(service.archiveThread('child')).rejects.toThrow(
      'root archive failed',
    );

    // Stopping at the first failure would leave the tree half-archived.
    expect(mockCodex.request).toHaveBeenNthCalledWith(2, 'thread/archive', {
      threadId: 'child',
    });
  });

  it('blocks compaction when a thread has known descendants', async () => {
    mockBranches.readBranchState.mockReturnValue({
      ...localBranchState('root'),
      hasKnownDescendants: true,
    });
    mockCodex.request.mockResolvedValue({ data: [], nextCursor: null });

    await expect(service.compactThread('root')).rejects.toMatchObject({
      errorCode: ErrorCode.threads.compactBlockedByDescendants,
    });

    expect(mockCodex.request).not.toHaveBeenCalledWith(
      'thread/compact/start',
      expect.anything(),
    );
  });

  it('blocks compaction when app-server exposes an external fork descendant', async () => {
    mockBranches.readBranchState.mockReturnValue(localBranchState('root'));
    mockCodex.request
      .mockResolvedValueOnce({
        data: [{ id: 'child', forkedFromId: 'root' }],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ data: [], nextCursor: null });

    await expect(service.compactThread('root')).rejects.toMatchObject({
      errorCode: ErrorCode.threads.compactBlockedByDescendants,
    });

    // Archived forks still read the parent's history, so both pages matter.
    expect(mockCodex.request).toHaveBeenNthCalledWith(1, 'thread/list', {
      cursor: undefined,
      limit: 200,
      archived: false,
      modelProviders: [],
    });
    expect(mockCodex.request).toHaveBeenNthCalledWith(2, 'thread/list', {
      cursor: undefined,
      limit: 200,
      archived: true,
      modelProviders: [],
    });
  });

  it('answers branch state from local topology without listing threads', () => {
    const state = localBranchState('root');
    mockBranches.readBranchState.mockReturnValue(state);

    expect(service.readBranchState('root')).toBe(state);
    expect(mockCodex.request).not.toHaveBeenCalled();
  });

  it('delegates tracked message branch creation', async () => {
    const response = {
      fork: { thread: { id: 'child' } },
      tree: {
        treeRootThreadId: 'root',
        tracked: true,
        members: [],
        groups: [],
      },
      group: {
        groupId: 'group',
        treeRootThreadId: 'root',
        commonPrefixTurnId: null,
        createdAt: 1,
        updatedAt: 1,
        versions: [],
      },
      version: {
        versionId: 'version',
        groupId: 'group',
        threadId: 'child',
        versionIndex: 2,
        kind: 'branch',
        messageTurnId: null,
        previewText: 'edited',
        createdAt: 1,
        updatedAt: 1,
      },
    };
    mockBranching.createMessageBranch.mockResolvedValue(response);

    await expect(
      service.createMessageBranch('source', {
        editedTurnId: 'turn-a',
        previewText: 'edited',
      }),
    ).resolves.toBe(response);

    expect(mockBranching.createMessageBranch).toHaveBeenCalledWith('source', {
      editedTurnId: 'turn-a',
      previewText: 'edited',
    });
  });
});

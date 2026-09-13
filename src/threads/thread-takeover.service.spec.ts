import { ThreadTakeoverService } from './thread-takeover.service';
import { ThreadsService } from './threads.service';
import { ThreadWriterService } from './thread-writer.service';
import { ThreadResumeRegistryService } from './thread-resume-registry.service';
import { ThreadDeletionRegistryService } from '../thread-deletion/thread-deletion-registry.service';
import { ErrorCode } from '../common/error-codes';

const owner = {
  pid: 4321,
  startTime: '100',
  executable: '/test/codex',
  threadIds: ['t1', 't2'],
};
describe('ThreadTakeoverService', () => {
  const threads = { readThread: jest.fn(), resumeThread: jest.fn() };
  const writers = { inspect: jest.fn(), stop: jest.fn() };
  const resumes = { forget: jest.fn() };
  const deletions = { assertMutable: jest.fn() };
  let service: ThreadTakeoverService;
  beforeEach(() => {
    jest.resetAllMocks();
    service = new ThreadTakeoverService(
      threads as unknown as ThreadsService,
      writers as unknown as ThreadWriterService,
      resumes as unknown as ThreadResumeRegistryService,
      deletions as unknown as ThreadDeletionRegistryService,
    );
    threads.readThread.mockResolvedValue({ thread: { id: 't1' } });
    threads.resumeThread.mockResolvedValue({ thread: { id: 't1', turns: [] } });
    writers.inspect.mockResolvedValue(owner);
  });
  afterEach(() => jest.restoreAllMocks());
  it('previews the affected set without stopping any process', async () => {
    const preview = await service.preview('t1');
    expect(preview).toMatchObject({
      ownerPid: 4321,
      affectedThreadIds: ['t1', 't2'],
    });
    expect(writers.stop).not.toHaveBeenCalled();
  });
  it('stops the confirmed writer before resuming the same thread', async () => {
    const preview = await service.preview('t1');
    expect(
      await service.takeover('t1', preview.confirmationToken),
    ).toMatchObject({ thread: { id: 't1' } });
    expect(writers.stop).toHaveBeenCalledWith('t1', owner);
    expect(resumes.forget).toHaveBeenCalledWith('t1');
    expect(writers.stop.mock.invocationCallOrder[0]).toBeLessThan(
      threads.resumeThread.mock.invocationCallOrder[0],
    );
  });
  it('rejects missing, expired, reused and wrong-thread confirmations', async () => {
    await expect(service.takeover('t1', 'invalid')).rejects.toMatchObject({
      errorCode: ErrorCode.threads.takeoverChanged,
    });
    const preview = await service.preview('t1');
    await expect(
      service.takeover('other', preview.confirmationToken),
    ).rejects.toThrow();
    const time = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    await expect(
      service.takeover('t1', preview.confirmationToken),
    ).rejects.toThrow();
    time.mockRestore();
    await service.takeover('t1', preview.confirmationToken);
    await expect(
      service.takeover('t1', preview.confirmationToken),
    ).rejects.toThrow();
    expect(writers.stop).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...owner, pid: 4322 },
    { ...owner, startTime: '200' },
    { ...owner, threadIds: ['t1', 't2', 't3'] },
  ])(
    'requires a fresh confirmation when the owner changes: %j',
    async (changed) => {
      const preview = await service.preview('t1');
      writers.inspect.mockResolvedValue(changed);
      await expect(
        service.takeover('t1', preview.confirmationToken),
      ).rejects.toMatchObject({ errorCode: ErrorCode.threads.takeoverChanged });
      expect(writers.stop).not.toHaveBeenCalled();
    },
  );
  it('resumes without termination when the other client has already released the lock', async () => {
    const preview = await service.preview('t1');
    writers.inspect.mockResolvedValue(null);
    await service.takeover('t1', preview.confirmationToken);
    expect(writers.stop).not.toHaveBeenCalled();
    expect(threads.resumeThread).toHaveBeenCalledWith('t1');
  });
  it('does not terminate a new writer after an unowned preview', async () => {
    writers.inspect.mockResolvedValueOnce(null);
    const preview = await service.preview('t1');
    await expect(
      service.takeover('t1', preview.confirmationToken),
    ).rejects.toThrow();
    expect(writers.stop).not.toHaveBeenCalled();
  });
  it('leaves the conversation unavailable if the writer cannot be verified or stopped', async () => {
    writers.inspect.mockRejectedValueOnce(new Error('Cannot verify writer'));
    await expect(service.preview('t1')).rejects.toMatchObject({
      errorCode: ErrorCode.threads.takeoverUnavailable,
    });
    const preview = await service.preview('t1');
    writers.stop.mockRejectedValueOnce(new Error('Writer still running'));
    await expect(
      service.takeover('t1', preview.confirmationToken),
    ).rejects.toThrow();
    expect(threads.resumeThread).not.toHaveBeenCalled();
  });
  it('does not stop a writer whose affected conversation is being deleted', async () => {
    const preview = await service.preview('t1');
    deletions.assertMutable.mockImplementation((id: string) => {
      if (id === 't2') throw new Error('Deleting');
    });
    await expect(
      service.takeover('t1', preview.confirmationToken),
    ).rejects.toThrow('Deleting');
    expect(writers.stop).not.toHaveBeenCalled();
  });
});

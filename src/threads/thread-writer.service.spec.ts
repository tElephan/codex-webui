import { CodexProcessManager } from '../codex/codex-process-manager.service';
import { ThreadWriterService } from './thread-writer.service';

const owner = {
  pid: 12345,
  startTime: '100',
  executable: '/test/codex',
  threadIds: ['t1'],
};
describe('ThreadWriterService', () => {
  const service = new ThreadWriterService({} as CodexProcessManager);
  afterEach(() => jest.restoreAllMocks());
  it('revalidates before signaling and waits for the OS lock to be released', async () => {
    const inspect = jest
      .spyOn(service, 'inspect')
      .mockResolvedValueOnce(owner)
      .mockResolvedValue(null);
    const kill = jest.spyOn(process, 'kill').mockReturnValue(true);
    await service.stop('t1', owner);
    expect(kill).toHaveBeenCalledWith(owner.pid, 'SIGTERM');
    expect(inspect).toHaveBeenCalledTimes(2);
  });
  it('never signals a replacement process', async () => {
    jest
      .spyOn(service, 'inspect')
      .mockResolvedValue({ ...owner, startTime: '200' });
    const kill = jest.spyOn(process, 'kill').mockReturnValue(true);
    await expect(service.stop('t1', owner)).rejects.toThrow('changed');
    expect(kill).not.toHaveBeenCalled();
  });
  it('does not signal a writer that already released the lock', async () => {
    jest.spyOn(service, 'inspect').mockResolvedValue(null);
    const kill = jest.spyOn(process, 'kill').mockReturnValue(true);
    await service.stop('t1', owner);
    expect(kill).not.toHaveBeenCalled();
  });
});

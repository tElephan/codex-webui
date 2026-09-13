import { mkdtemp, mkdir, writeFile, symlink, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectThreadWriter,
  sameThreadWriter,
} from './thread-writer-inspector';

const THREAD = '00000000-0000-7000-8000-000000000001';
const OTHER = '00000000-0000-7000-8000-000000000002';

describe('thread writer inspection', () => {
  let root: string;
  let procRoot: string;
  let locks: string;
  const identity = (pid: number, parent: number, start = '100') => {
    const fields = Array<string>(20).fill('0');
    fields[0] = 'S';
    fields[1] = String(parent);
    fields[19] = start;
    return `${pid} (codex (test) worker) ${fields.join(' ')}`;
  };
  const options = () => ({
    procRoot,
    processId: 200,
    userId: process.getuid!(),
  });
  async function own(threadId: string, pid = 400) {
    const path = join(locks, `${threadId}.lock`);
    await writeFile(path, '');
    const file = await stat(path, { bigint: true });
    const major =
      ((file.dev >> 8n) & 0xfffn) | ((file.dev >> 32n) & 0xfffff000n);
    const minor = (file.dev & 0xffn) | ((file.dev >> 12n) & 0xffffff00n);
    await writeFile(
      join(procRoot, 'locks'),
      `1: FLOCK ADVISORY WRITE ${pid} ${major.toString(16)}:${minor.toString(16)}:${file.ino} 0 EOF\n`,
      { flag: 'a' },
    );
  }
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'webui-writer-test-'));
    procRoot = join(root, 'proc');
    locks = join(root, 'thread-writer-locks');
    await mkdir(locks);
    for (const pid of [1, 200, 400]) {
      await mkdir(join(procRoot, String(pid)), { recursive: true });
      await writeFile(
        join(procRoot, String(pid), 'stat'),
        identity(pid, pid === 1 ? 0 : 1),
      );
    }
    await symlink('/test/bin/codex', join(procRoot, '400/exe'));
    await writeFile(join(procRoot, 'locks'), '');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports the actual lock owner and all its affected conversations', async () => {
    await own(THREAD);
    await own(OTHER);
    expect(await inspectThreadWriter(root, THREAD, options())).toEqual({
      pid: 400,
      startTime: '100',
      executable: '/test/bin/codex',
      threadIds: [THREAD, OTHER],
    });
  });
  it('treats missing and stale unlocked files as unowned', async () => {
    expect(await inspectThreadWriter(root, THREAD, options())).toBeNull();
    await writeFile(join(locks, `${THREAD}.lock`), '');
    expect(await inspectThreadWriter(root, THREAD, options())).toBeNull();
  });
  it('rejects path traversal and symbolic thread lock files', async () => {
    await expect(
      inspectThreadWriter(root, '../../other', options()),
    ).rejects.toThrow('Invalid thread id');
    await symlink(join(procRoot, 'locks'), join(locks, `${THREAD}.lock`));
    await expect(inspectThreadWriter(root, THREAD, options())).rejects.toThrow(
      'Cannot verify',
    );
  });
  it('refuses non-Codex processes and another user', async () => {
    await own(THREAD);
    await expect(
      inspectThreadWriter(root, THREAD, {
        ...options(),
        userId: process.getuid!() + 1,
      }),
    ).rejects.toThrow('not a local Codex');
    await rm(join(procRoot, '400/exe'));
    await symlink('/test/bin/editor', join(procRoot, '400/exe'));
    await expect(inspectThreadWriter(root, THREAD, options())).rejects.toThrow(
      'not a local Codex',
    );
  });
  it('protects this WebUI and both its descendants and ancestors', async () => {
    await own(THREAD);
    await writeFile(join(procRoot, '400/stat'), identity(400, 200));
    await expect(inspectThreadWriter(root, THREAD, options())).rejects.toThrow(
      'serving this WebUI',
    );
    await writeFile(join(procRoot, '400/stat'), identity(400, 1));
    await writeFile(join(procRoot, '200/stat'), identity(200, 400));
    await expect(inspectThreadWriter(root, THREAD, options())).rejects.toThrow(
      'serving this WebUI',
    );
  });
  it('detects a reused PID and changes to the affected conversation set', async () => {
    await own(THREAD);
    const initial = await inspectThreadWriter(root, THREAD, options());
    await writeFile(join(procRoot, '400/stat'), identity(400, 1, '200'));
    expect(
      sameThreadWriter(
        initial,
        await inspectThreadWriter(root, THREAD, options()),
      ),
    ).toBe(false);
    await writeFile(join(procRoot, '400/stat'), identity(400, 1));
    await own(OTHER);
    expect(
      sameThreadWriter(
        initial,
        await inspectThreadWriter(root, THREAD, options()),
      ),
    ).toBe(false);
  });
});

/** Linux writer inspection: file existence alone never proves that a writer is active. */
import { lstat, readFile, readdir, readlink, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

export interface ThreadWriter {
  pid: number;
  startTime: string;
  executable: string;
  threadIds: string[];
}

interface InspectionOptions {
  procRoot?: string;
  processId?: number;
  userId?: number;
}

export class WriterInspectionError extends Error {}

export const THREAD_ID_PATTERN =
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Converts Linux dev_t to the major:minor:inode key used by /proc/locks. */
function lockIdentity(device: bigint, inode: bigint): string {
  const major = ((device >> 8n) & 0xfffn) | ((device >> 32n) & 0xfffff000n);
  const minor = (device & 0xffn) | ((device >> 12n) & 0xffffff00n);
  return `${major}:${minor}:${inode}`;
}

function activeLocks(contents: string): Map<string, number> {
  const locks = new Map<string, number>();
  for (const line of contents.split('\n')) {
    const match =
      /^\d+:\s+FLOCK\s+ADVISORY\s+WRITE\s+(\d+)\s+([\da-f]+):([\da-f]+):(\d+)\s/i.exec(
        line,
      );
    if (!match) continue;
    locks.set(
      `${BigInt(`0x${match[2]}`)}:${BigInt(`0x${match[3]}`)}:${BigInt(match[4])}`,
      Number(match[1]),
    );
  }
  return locks;
}

async function processIdentity(procRoot: string, pid: number) {
  const value = await readFile(join(procRoot, String(pid), 'stat'), 'utf8');
  // comm can contain spaces and parentheses; fields after its final ')' are stable.
  const fields = value.slice(value.lastIndexOf(')') + 2).split(' ');
  return { parentPid: Number(fields[1]), startTime: fields[19] };
}

async function ancestors(procRoot: string, pid: number): Promise<Set<number>> {
  const seen = new Set<number>();
  while (pid > 0 && !seen.has(pid)) {
    seen.add(pid);
    pid = (await processIdentity(procRoot, pid)).parentPid;
  }
  return seen;
}

/** Finds only a same-user Codex writer outside this WebUI's own process tree. */
export async function inspectThreadWriter(
  codexHome: string,
  threadId: string,
  options: InspectionOptions = {},
): Promise<ThreadWriter | null> {
  if (!THREAD_ID_PATTERN.test(threadId))
    throw new WriterInspectionError('Invalid thread id');
  const procRoot = options.procRoot ?? '/proc';
  const selfPid = options.processId ?? process.pid;
  const uid = options.userId ?? process.getuid?.();
  if (
    uid === undefined ||
    (process.platform !== 'linux' && !options.procRoot)
  ) {
    throw new WriterInspectionError(
      'Force takeover is only available for local Linux Codex clients',
    );
  }
  const directory = join(codexHome, 'thread-writer-locks');
  const lockPath = join(directory, `${threadId}.lock`);
  const target = await lstat(lockPath, { bigint: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    },
  );
  if (!target) return null;
  if (!target.isFile())
    throw new WriterInspectionError('Cannot verify the thread writer lock');
  const locks = activeLocks(await readFile(join(procRoot, 'locks'), 'utf8'));
  const pid = locks.get(lockIdentity(target.dev, target.ino));
  if (!pid) return null;
  const processPath = join(procRoot, String(pid));
  const identity = await processIdentity(procRoot, pid);
  const owner = await stat(processPath);
  const executable = await readlink(join(processPath, 'exe'));
  if (
    owner.uid !== uid ||
    basename(executable.replace(/ \(deleted\)$/, '')) !== 'codex'
  ) {
    throw new WriterInspectionError(
      'The writer is not a local Codex process owned by this user',
    );
  }
  if (
    (await ancestors(procRoot, pid)).has(selfPid) ||
    (await ancestors(procRoot, selfPid)).has(pid)
  ) {
    throw new WriterInspectionError(
      'Cannot terminate the Codex process serving this WebUI',
    );
  }
  const threadIds: string[] = [];
  for (const name of await readdir(directory)) {
    const id = name.replace(/\.lock$/, '');
    if (!name.endsWith('.lock') || !THREAD_ID_PATTERN.test(id)) continue;
    const file = await lstat(join(directory, name), { bigint: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      },
    );
    if (file?.isFile() && locks.get(lockIdentity(file.dev, file.ino)) === pid)
      threadIds.push(id);
  }
  if (
    !threadIds.includes(threadId) ||
    (await processIdentity(procRoot, pid)).startTime !== identity.startTime
  ) {
    throw new WriterInspectionError(
      'The thread writer changed; refresh the takeover preview',
    );
  }
  return {
    pid,
    startTime: identity.startTime,
    executable,
    threadIds: threadIds.sort(),
  };
}

export function sameThreadWriter(
  left: ThreadWriter | null,
  right: ThreadWriter | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

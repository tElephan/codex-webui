export interface LocalFileLink {
  path: string;
  line?: number;
  column?: number;
}

const WEB_PATH_PREFIXES = [
  '/api/',
  '/login',
  '/settings',
  '/t/',
];

function decodeHref(href: string): string | null {
  try {
    return decodeURIComponent(href);
  } catch {
    return null;
  }
}

function normalizeAbsolutePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function extractPosition(value: string): LocalFileLink {
  const match = value.match(/^(.*?):(\d+)(?::(\d+))?$/);
  if (!match) return { path: value };

  return {
    path: match[1],
    line: Number(match[2]),
    ...(match[3] ? { column: Number(match[3]) } : {}),
  };
}

/** Resolves a Markdown href to a server-side file path when it is unambiguous. */
export function parseLocalFileLink(
  href: string | undefined,
  threadCwd: string | null,
  allowBareRelative = false,
): LocalFileLink | null {
  if (!href) return null;

  const decoded = decodeHref(href);
  if (!decoded) return null;

  let candidate = decoded;
  if (candidate.startsWith('file://')) {
    try {
      const fileUrl = new URL(candidate);
      if (fileUrl.hostname && fileUrl.hostname !== 'localhost') return null;
      candidate = decodeURIComponent(fileUrl.pathname);
    } catch {
      return null;
    }
  }

  const positioned = extractPosition(candidate);
  const rawPath = positioned.path;
  let absolutePath: string;

  if (rawPath.startsWith('/')) {
    if (WEB_PATH_PREFIXES.some((prefix) => rawPath === prefix.slice(0, -1) || rawPath.startsWith(prefix))) {
      return null;
    }
    absolutePath = normalizeAbsolutePath(rawPath);
  } else if (
    threadCwd?.startsWith('/') &&
    (rawPath.startsWith('./') || rawPath.startsWith('../'))
  ) {
    absolutePath = normalizeAbsolutePath(`${threadCwd}/${rawPath}`);
  } else if (
    allowBareRelative &&
    threadCwd?.startsWith('/') &&
    !rawPath.startsWith('#') &&
    !rawPath.startsWith('?') &&
    !rawPath.startsWith('//') &&
    !/^[a-z][a-z\d+.-]*:/i.test(rawPath)
  ) {
    absolutePath = normalizeAbsolutePath(`${threadCwd}/${rawPath}`);
  } else {
    return null;
  }

  return { ...positioned, path: absolutePath };
}

/** Opens a server-side file in the thread's session panel. */
export function openFileInPanel(absolutePath: string): void {
  window.dispatchEvent(
    new CustomEvent('codex-webui:open-file', { detail: { path: absolutePath } }),
  );
}

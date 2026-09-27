/** Real chat link clicks, thread route and file browser with local HTTP responses. */
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useRouterState } from '@tanstack/react-router';
import { ThreadView } from '../../src/routes/thread-view';
import { FilesPanel } from '../../src/components/files/files-panel';
import { SnackbarContainer } from '../../src/components/snackbar/snackbar-container';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { client } from '../../src/generated/api/client.gen';
import { getSocket } from '../../src/socket';
import { useFilesStore } from '../../src/stores/files-store';
import { useTerminalStore } from '../../src/stores/terminal-store';
import { useTimelineStore } from '../../src/stores/timeline-store';
import { useSnackbarStore } from '../../src/stores/snackbar-store';
import i18n from '../../src/i18n';
import '../../src/index.css';

await i18n.changeLanguage('en');
const socket = getSocket();
socket.disconnect();
socket.emit = (() => socket) as typeof socket.emit;
useTerminalStore.setState({ ensureContext: async () => {} });
useFilesStore.setState({
  activeContext: 'thread', rootDir: '/work', selectedFile: null,
  windowRootDir: '/previous', windowSelectedFile: '/previous/draft.ts',
  windowFileTabs: ['/previous/draft.ts'],
  fileEdits: { '/previous/draft.ts': { content: 'unsaved draft', expectedMtime: 1 } },
});
const directories: Record<string, string[]> = {
  '/work': ['reports.v1/', '资料 目录/', 'empty/', 'guide.md', 'README'],
  '/work/reports.v1': ['nested/', 'result.md'],
  '/work/reports.v1/nested': ['child.md'],
  '/work/资料 目录': ['notes.md'],
  '/work/empty': [],
  '/previous': ['draft.ts'],
};
const links = [
  '[Directory](/work/reports.v1)',
  '[Trailing slash](/work/reports.v1/)',
  '[Relative directory](./reports.v1)',
  '[Unicode directory](file:///work/%E8%B5%84%E6%96%99%20%E7%9B%AE%E5%BD%95)',
  '[Empty directory](/work/empty)',
  '[Alias directory](/work/alias)',
  '[Markdown file](/work/guide.md:12)',
  '[Extensionless file](/work/README)',
  '[Missing path](/work/missing)',
  '[Forbidden path](/work/private)',
  '[Special path](/work/special)',
].join('\n\n');
const snapshot = (id: string) => ({
  id, cwd: '/work', name: id, preview: id, createdAt: 1, updatedAt: 2,
  status: { type: 'idle' },
  turns: [{ id: `${id}-turn`, status: 'completed', items: [{ type: 'agentMessage', id: `${id}-answer`, text: links }] }],
});
const requests: { endpoint: string; path: string | null }[] = [];
const held = new Set<string>();
const pending = new Map<string, (() => void)[]>();
client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    const url = new URL(request.url);
    const path = url.searchParams.get('path') ?? url.searchParams.get('root');
    requests.push({ endpoint: url.pathname, path });
    const match = url.pathname.match(/^\/api\/threads\/([^/]+)(\/resume)?$/);
    if (match) return Response.json({ thread: snapshot(match[1]), cwd: '/work' });
    if (url.pathname === '/api/files/metadata') {
      if (held.has(path!)) await new Promise<void>((resolve) => pending.set(path!, [...(pending.get(path!) ?? []), resolve]));
      if (path === '/work/missing') return Response.json({ message: 'Path not found' }, { status: 404 });
      if (path === '/work/private') return Response.json({ message: 'Permission denied' }, { status: 403 });
      const resolved = path === '/work/alias' ? '/work/reports.v1' : path!;
      return Response.json({ path: resolved, name: resolved.split('/').pop(), type: resolved === '/work/special' ? 'other' : resolved in directories ? 'directory' : 'file', size: 20, mtime: 1 });
    }
    if (url.pathname === '/api/files/tree') return Response.json((directories[path!] ?? []).map((name) => ({
      path: `${path}/${name.replace(/\/$/, '')}`, name: name.replace(/\/$/, ''), type: name.endsWith('/') ? 'directory' : 'file',
    })));
    if (url.pathname === '/api/files/read') {
      if (path! in directories) return Response.json({ message: 'Cannot read a directory as a file' }, { status: 400 });
      return Response.json({ path, content: '# File preview\n\nFile content is visible.', size: 20 });
    }
    if (url.pathname === '/api/files/roots') return Response.json({ roots: ['/work'], homeDir: '/work' });
    if (url.pathname === '/api/settings') return Response.json({ settings: [] });
    if (url.pathname === '/api/pending-approvals') return Response.json({ requests: [] });
    if (url.pathname.endsWith('/turn-errors')) return Response.json({ errors: [] });
    return Response.json({ data: [], groups: [], turns: [], status: 'ready', account: null, config: { data: {} } });
  },
});
const timeline = useTimelineStore.getState();
timeline.ensureThreadState({ threadId: 'links', cwd: '/work' });
timeline.reconcileThreadSnapshot(snapshot('links') as never, timeline.getThreadRuntime('links')!);
timeline.selectThread('links');

export function Fixture() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    useFilesStore.getState().activateContext(pathname === '/files' ? 'window' : 'thread', '/work');
  }, [pathname]);
  return <TooltipProvider><main className="flex h-dvh min-h-0 flex-col"><Outlet /></main><SnackbarContainer /></TooltipProvider>;
}
const root = createRootRoute({ component: Fixture });
const thread = createRoute({ getParentRoute: () => root, path: '/t/$threadId', component: ThreadView });
const files = createRoute({ getParentRoute: () => root, path: '/files', component: FilesPanel });
const router = createRouter({ routeTree: root.addChildren([thread, files]), history: createMemoryHistory({ initialEntries: ['/t/links'] }) });
Object.assign(window, {
  fileLinksTest: {
    files: useFilesStore, snackbar: useSnackbarStore, requests,
    currentRoute: () => router.state.location.pathname,
    chat: (id = 'links') => router.navigate({ to: '/t/$threadId', params: { threadId: id } }),
    hold: (path: string) => held.add(path),
    pending: (path: string) => pending.has(path),
    release: (path: string) => {
      held.delete(path);
      for (const resolve of pending.get(path) ?? []) resolve();
      pending.delete(path);
    },
  },
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);

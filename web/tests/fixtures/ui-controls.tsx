/** Actual responsive header and FilesPanel backed by a small in-memory filesystem. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { ChatHeader } from '../../src/components/chat/chat-header';
import { FilesPanel } from '../../src/components/files/files-panel';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { client } from '../../src/generated/api/client.gen';
import { useFilesStore } from '../../src/stores/files-store';
import { useThemeStore } from '../../src/stores/theme-store';
import i18n from '../../src/i18n';
import '../../src/index.css';

const directories: Record<string, string[]> = {
  '/': ['workspace/'],
  '/workspace': ['src/', 'src-old/', 'src notes/', 'demo.ts', '.hidden', 'README.md', 'slow/', 'new/'],
  '/workspace/src': ['components/', 'main.ts'],
  '/workspace/src/components': ['button.tsx'],
  '/workspace/src-old': [],
  '/workspace/src notes': ['notes.md'],
  '/workspace/slow': ['stale.ts'],
  '/workspace/new': ['fresh.ts'],
};
const requests: { url: string; method: string }[] = [];
await i18n.changeLanguage('zh-CN');
useFilesStore.setState({ activeContext: 'window', rootDir: '/workspace', selectedFile: null, windowFileTabs: [], fileEdits: {} });
client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    const url = new URL(request.url);
    requests.push({ url: request.url, method: request.method });
    if (url.pathname === '/api/account') return Response.json({ account: null });
    if (url.pathname === '/api/settings') return Response.json({ settings: [] });
    if (url.pathname === '/api/files/roots') return Response.json({ roots: ['/workspace'] });
    if (url.pathname === '/api/files/read') return Response.json({ content: 'export const preview = true;', size: 28 });
    const path = (url.searchParams.get('root') ?? url.searchParams.get('path') ?? '').replace(/\/$/, '') || '/';
    if (url.pathname === '/api/files/metadata') {
      return Response.json({ path, name: path.split('/').pop(), type: path in directories ? 'directory' : 'file', mtime: 1, size: 28 });
    }
    if (url.pathname === '/api/files/tree') {
      if (path === '/workspace/slow') await new Promise((resolve) => setTimeout(resolve, 800));
      if (!(path in directories)) return Response.json({ message: 'Unavailable directory' }, { status: 403 });
      return Response.json(directories[path].map((name) => ({
        path: `${path === '/' ? '' : path}/${name.replace(/\/$/, '')}`,
        name: name.replace(/\/$/, ''),
        type: name.endsWith('/') ? 'directory' : 'file',
      })));
    }
    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
  },
});
Object.assign(window, { uiControlsTest: { requests, theme: useThemeStore, files: useFilesStore } });
const rootRoute = createRootRoute({ component: () => (
  <TooltipProvider>
    <main className="flex h-dvh flex-col">
      <ChatHeader onToggleDiagnostics={() => {}} />
      <FilesPanel />
    </main>
  </TooltipProvider>
) });
const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/'] }) });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);

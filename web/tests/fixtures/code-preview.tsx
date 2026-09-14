/** Real preview layouts with local file responses and no terminal connections. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionPanel } from '../../src/components/chat/session-panel';
import { FilesPanel } from '../../src/components/files/files-panel';
import { client } from '../../src/generated/api/client.gen';
import { getSocket } from '../../src/socket';
import { useFilesStore } from '../../src/stores/files-store';
import { useTerminalStore } from '../../src/stores/terminal-store';
import { useThemeStore } from '../../src/stores/theme-store';
import i18n from '../../src/i18n';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const filePath = `/fixture/${params.get('file') ?? 'example.ts'}`;
const code = Array.from(
  { length: 80 },
  (_, index) => `export const value${index + 1}: number = ${index + 1};`,
).join('\n');
const contents = new Map([
  ['/fixture/example.ts', code],
  ['/fixture/README.md', `# Preview\n\nExample code:\n\n\`\`\`typescript\n${code}\n\`\`\`\n`],
]);
const writes: unknown[] = [];

await i18n.changeLanguage('en');
getSocket().disconnect();
useTerminalStore.setState({ ensureContext: async () => {} });
useThemeStore.getState().setDark(params.has('dark'));
useFilesStore.setState({
  activeContext: params.has('window') ? 'window' : 'thread',
  rootDir: '/fixture',
  selectedFile: filePath,
  windowSelectedFile: filePath,
  windowFileTabs: [filePath],
  fileEdits: {},
});

client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    const url = new URL(request.url);
    const path = url.searchParams.get('path') ?? filePath;
    switch (url.pathname) {
      case '/api/files/metadata':
        return Response.json({ path, name: path.split('/').pop(), type: 'file', size: code.length, mtime: 1 });
      case '/api/files/read':
        return Response.json({ path, content: contents.get(path) ?? code, size: code.length });
      case '/api/files/write': {
        const body = await request.json();
        writes.push(body);
        contents.set(body.path, body.content);
        return Response.json({ mtime: 2 });
      }
      case '/api/files/tree':
        return Response.json(['example.ts', 'README.md', 'example.zip'].map((name) => ({
          path: `/fixture/${name}`, name, type: 'file', size: code.length,
        })));
      case '/api/files/roots':
        return Response.json({ roots: ['/fixture'] });
      case '/api/files/archive/list':
        return Response.json({ path, entries: [{ path: 'entry.ts', name: 'entry.ts', type: 'file', size: code.length }] });
      case '/api/settings':
        return Response.json({ settings: [] });
      default:
        throw new Error(`Unexpected fixture request: ${url.pathname}`);
    }
  },
});

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.pathname === '/api/files/archive/entry') {
    return Promise.resolve(new Response(code));
  }
  return originalFetch(input, init);
};

Object.assign(window, {
  codePreviewTest: {
    writes,
    setDark: (dark: boolean) => useThemeStore.getState().setDark(dark),
    getEdit: () => useFilesStore.getState().fileEdits[filePath],
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <main className="flex h-dvh min-h-0 flex-col" data-testid="preview-layout">
      {params.has('window') ? (
        <FilesPanel />
      ) : (
        <SessionPanel
          threadId="preview-fixture"
          cwd="/fixture"
          onClose={() => {}}
          onOpenFileWindow={() => {}}
        />
      )}
    </main>
  </QueryClientProvider>,
);

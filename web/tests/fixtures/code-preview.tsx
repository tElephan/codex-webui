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
const tex = String.raw`% TeX source preview
\documentclass{article}
\begin{document}
\section{A sample equation}
\[ E = mc^2 \]
Escaped percent: 50\% % a comment
\end{document}`;
const contents = new Map([
  ['/fixture/example.ts', code],
  ['/fixture/example.tex', tex],
  ['/fixture/example.cpp', '#include <iostream>\nint main() { std::cout << "Hello"; }'],
  ['/fixture/example.py', 'def hello(name: str):\n    return f"Hello {name}"'],
  ['/fixture/example.java', 'public class Example { public static void main(String[] args) {} }'],
  ['/fixture/example.vue', '<template><p>Hello</p></template>'],
  ['/fixture/example.proto', 'syntax = "proto3";\nmessage Example { string name = 1; }'],
  ['/fixture/.env.local', 'PORT=4545\nMODE=development'],
  ['/fixture/README.md', `# Preview\n\nExample code:\n\n\`\`\`typescript\n${code}\n\`\`\`\n`],
]);
const archiveEntry = params.get('entry') ?? 'entry.ts';
const html = `<!doctype html><html><head><style>
body { margin: 24px; font-family: sans-serif; } h1 { color: rgb(0, 128, 128); }
</style></head><body><h1>HTML preview fixture</h1>
<button onclick="this.textContent='Clicked'">Try script</button>
<script>
try { parent.document.body.dataset.previewEscaped = 'true'; }
catch { document.body.dataset.isolated = 'true'; }
</script></body></html>`;
contents.set('/fixture/example.html', html);
contents.set('/fixture/example.HTM', html);
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
        return Response.json([...contents.keys()].map((path) => path.split('/').pop()!).concat('example.zip').map((name) => ({
          path: `/fixture/${name}`, name, type: 'file', size: code.length,
        })));
      case '/api/files/roots':
        return Response.json({ roots: ['/fixture'] });
      case '/api/files/archive/list':
        return Response.json({ path, entries: [{ path: archiveEntry, name: archiveEntry, type: 'file', size: code.length }] });
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
    return Promise.resolve(new Response(contents.get(`/fixture/${archiveEntry}`) ?? code));
  }
  return originalFetch(input, init);
};

Object.assign(window, {
  codePreviewTest: {
    writes,
    setDark: (dark: boolean) => useThemeStore.getState().setDark(dark),
    getEdit: () => useFilesStore.getState().fileEdits[filePath],
    openFile: (name: string) => {
      const path = `/fixture/${name}`;
      if (params.has('window')) useFilesStore.getState().selectFileForWindow(path);
      else useFilesStore.getState().selectFile(path);
    },
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

/** Actual route/sidebar/timeline, with independently delayed history responses. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider,
} from '@tanstack/react-router';
import { ThreadView } from '../../src/routes/thread-view';
import { ChatHeader } from '../../src/components/chat/chat-header';
import { ThreadSidebar } from '../../src/components/chat/thread-sidebar';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { useTimelineStore } from '../../src/stores/timeline-store';
import { useThreadSyncStore } from '../../src/stores/thread-sync-store';
import { useConnectionStore } from '../../src/stores/connection-store';
import { useLayoutStore } from '../../src/stores/layout-store';
import { syncThread } from '../../src/lib/thread-sync';
import { client } from '../../src/generated/api/client.gen';
import { getSocket } from '../../src/socket';
import i18n from '../../src/i18n';
import '../../src/index.css';

await i18n.changeLanguage('zh-CN');
const socket = getSocket();
socket.disconnect();
socket.emit = (() => socket) as typeof socket.emit;
useConnectionStore.getState().setConnected(true);
useLayoutStore.setState({ collapsedGroupKeys: [], sidebarView: { type: 'overview' } });
const snapshot = (id: string) => ({
  id, cwd: '/work', name: id, preview: id, createdAt: 1, updatedAt: 2,
  status: { type: 'idle' },
  turns: Array.from({ length: id === 'long-session' ? 30 : 3 }, (_, index) => ({
    id: `${id}-turn-${index}`, status: 'completed',
    items: [{
      type: 'agentMessage', id: `${id}-answer-${index}`,
      text: `${id} 回复 ${index}\n\n` + '正文段落。\n\n'.repeat(id === 'long-session' ? 25 : 1),
    }],
  })),
});
const held = new Set<string>();
const pending: { key: string; release: () => void }[] = [];
const requests: string[] = [];
client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const key = `${request.method} ${path}`;
    requests.push(key);
    const match = path.match(/^\/api\/threads\/([^/]+)(\/resume)?$/);
    if (match && ['long-session', 'short-session', 'third-session'].includes(match[1])) {
      const thread = snapshot(match[1]); // Capture before the request waits.
      if (held.has(key)) await new Promise<void>((release) => pending.push({ key, release }));
      return Response.json({ thread, cwd: thread.cwd });
    }
    if (path === '/api/threads') return Response.json({
      data: url.searchParams.get('archived') === 'true' ? [] :
        ['long-session', 'short-session', 'third-session'].map(snapshot),
      nextCursor: null,
    });
    if (path.endsWith('/branch-trees')) return Response.json([]);
    if (path === '/api/pending-approvals') return Response.json({ requests: [] });
    if (path.endsWith('/turn-errors')) return Response.json({ errors: [] });
    return Response.json({
      data: [], groups: [], turns: [], status: 'ready', account: null,
      config: { data: { sandboxMode: 'workspace-write', approvalPolicy: 'on-request' } },
    });
  },
});
const store = useTimelineStore.getState();
store.ensureThreadState({ threadId: 'long-session', cwd: '/work' });
store.reconcileThreadSnapshot(snapshot('long-session') as never, store.getThreadRuntime('long-session')!);
store.selectThread('long-session');

export function Fixture() {
  return (
    <TooltipProvider>
      <main className="flex h-full overflow-hidden bg-background">
        <aside className="hidden w-64 shrink-0 lg:flex"><ThreadSidebar /></aside>
        <div data-chat-main className="isolate flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatHeader onToggleDiagnostics={() => {}} />
          <Outlet />
        </div>
      </main>
    </TooltipProvider>
  );
}
const rootRoute = createRootRoute({ component: Fixture });
const threadRoute = createRoute({ getParentRoute: () => rootRoute, path: '/t/$threadId', component: ThreadView });
const router = createRouter({
  routeTree: rootRoute.addChildren([threadRoute]),
  history: createMemoryHistory({ initialEntries: ['/t/long-session'] }),
});
Object.assign(window, {
  threadSwitchTest: {
    timeline: useTimelineStore, syncState: useThreadSyncStore, syncThread, requests,
    navigate: (threadId: string) => router.navigate({ to: '/t/$threadId', params: { threadId } }),
    hold: (key: string) => held.add(key),
    pending: () => pending.map((request) => request.key),
    release: (key: string) => {
      held.delete(key);
      for (let index = pending.length - 1; index >= 0; index--) {
        if (pending[index].key === key) pending.splice(index, 1)[0].release();
      }
    },
  },
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);

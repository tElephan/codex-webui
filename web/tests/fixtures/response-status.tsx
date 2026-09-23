/** Real socket hook and status/turn components, with a local transport and REST snapshots. */
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCodexSocket } from '../../src/hooks/use-codex-socket';
import { ChatActivityStatus } from '../../src/components/chat/chat-activity-status';
import { ChatTimeline } from '../../src/components/chat/chat-timeline';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { useTimelineStore } from '../../src/stores/timeline-store';
import { useThreadSyncStore } from '../../src/stores/thread-sync-store';
import { client } from '../../src/generated/api/client.gen';
import { getSocket } from '../../src/socket';
import i18n from '../../src/i18n';
import '../../src/index.css';

await i18n.changeLanguage('zh-CN');
const threadId = 'response-test';
const turnId = 'turn-test';
const socket = getSocket();
socket.disconnect();
socket.connected = true;
const emitLocal = (event: string, payload?: unknown) =>
  socket.listeners(event).forEach((listener) => listener(payload));
socket.connect = () => {
  socket.connected = true;
  emitLocal('connect');
  return socket;
};
socket.timeout = () => socket;
socket.emit = ((event: string, ...args: unknown[]) => {
  if (event === 'thread.subscribe' && typeof args.at(-1) === 'function')
    (args.at(-1) as (...args: unknown[]) => unknown)(null, { ok: true });
  return socket;
}) as typeof socket.emit;
const state = {
  fail: false,
  status: 'inProgress',
  text: '已经输出了部分内容，后续仍在处理。',
  pending: [] as unknown[],
  requests: [] as { method: string; path: string }[],
};
const snapshot = () => ({
  id: threadId,
  cwd: '/work',
  name: 'Status test',
  status: {
    type: state.status === 'inProgress' ? 'active' : 'idle',
    activeFlags: [],
  },
  turns: [
    {
      id: turnId,
      status: state.status,
      items: [{ type: 'agentMessage', id: 'answer', text: state.text }],
    },
  ],
});
client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    state.requests.push({ method: request.method, path });
    const body =
      path === `/api/threads/${threadId}`
        ? { thread: snapshot() }
        : path === '/api/pending-approvals'
          ? { requests: state.pending }
          : path.endsWith('/turn-errors')
            ? { errors: [] }
            : { turns: [], groups: [], status: 'ready' };
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (state.fail)
      return Response.json({ message: 'Offline fixture' }, { status: 503 });
    return Response.json(body);
  },
});
const store = useTimelineStore.getState();
store.ensureThreadState({ threadId });
store.reconcileThreadSnapshot(
  snapshot() as never,
  store.getThreadRuntime(threadId)!,
);
store.selectThread(threadId);
store.subscribeThread(threadId);
Object.assign(window, {
  responseTest: {
    state,
    timeline: useTimelineStore,
    sync: useThreadSyncStore,
    disconnect: () => {
      socket.connected = false;
      emitLocal('disconnect');
    },
    connect: () => socket.connect(),
    foreground: () => window.dispatchEvent(new Event('focus')),
    notify: (method: string, params: Record<string, unknown>) =>
      emitLocal('codex.notification', {
        method,
        params: { threadId, turnId, ...params },
      }),
    setDark: (dark: boolean) =>
      document.documentElement.classList.toggle('dark', dark),
  },
});
export function Fixture() {
  useCodexSocket();
  return (
    <main className="mx-auto flex h-dvh max-w-3xl flex-col p-4">
      <ChatTimeline />
      <footer className="shrink-0 pt-3">
        <ChatActivityStatus />
        <textarea
          aria-label="消息输入框"
          className="w-full rounded-xl border border-border bg-background p-3"
          placeholder="继续对话…"
        />
      </footer>
    </main>
  );
}
const router = createRouter({
  routeTree: createRootRoute({ component: Fixture }),
  history: createMemoryHistory({ initialEntries: ['/'] }),
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);

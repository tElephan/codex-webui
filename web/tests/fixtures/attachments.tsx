/** Full chat layout with local upload and turn responses; no files leave the browser. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { ChatHeader } from '../../src/components/chat/chat-header';
import { ChatTimeline } from '../../src/components/chat/chat-timeline';
import { ChatInput } from '../../src/components/chat/chat-input';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { client } from '../../src/generated/api/client.gen';
import { useTimelineStore } from '../../src/stores/timeline-store';
import { useConnectionStore } from '../../src/stores/connection-store';
import { useChatDraftStore } from '../../src/stores/chat-draft-store';
import { useQueuedTurnStore } from '../../src/stores/queued-turn-store';
import i18n from '../../src/i18n';
import '../../src/index.css';

const state = {
  uploads: [] as { name: string; path: string }[],
  turns: [] as unknown[],
  delay: 100,
  fail: false,
};
await i18n.changeLanguage('zh-CN');
const nativeFetch = window.fetch;
window.fetch = async (input, init) => {
  if (typeof input === 'string' && input.endsWith('/api/chat/upload')) {
    const file = (init!.body as FormData).get('file') as File;
    const path = `/uploads/${state.uploads.length}-${file.name}`;
    state.uploads.push({ name: file.name, path });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, state.delay);
      init?.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
    return state.fail
      ? Response.json(
          { errorCode: 'files.upload_too_large', message: 'Too large' },
          { status: 413 },
        )
      : Response.json({ path });
  }
  return nativeFetch(input, init);
};
client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    if (new URL(request.url).pathname === '/api/files/tree') {
      return Response.json(Array.from({ length: 20 }, (_, index) => ({
        name: `source-${index}.ts`, path: `/work/source-${index}.ts`, type: 'file',
      })));
    }
    if (request.method === 'POST') {
      state.turns.push(await request.json());
      return Response.json({ turn: { id: 'new-turn' } });
    }
    return Response.json({
      data: [],
      groups: [],
      turns: [],
      status: 'ready',
      account: null,
      config: {
        data: { sandboxMode: 'workspace-write', approvalPolicy: 'on-request' },
      },
    });
  },
});
const store = useTimelineStore.getState();
store.ensureThreadState({ threadId: 'attachments-test', cwd: '/work' });
store.ensureThreadState({ threadId: 'other-thread', cwd: '/work' });
store.reconcileThreadSnapshot(
  {
    id: 'attachments-test',
    cwd: '/work',
    status: { type: 'idle' },
    turns: Array.from({ length: 8 }, (_, index) => ({
      id: `turn-${index}`,
      status: 'completed',
      items: [{
        type: 'agentMessage',
        id: `answer-${index}`,
        text: `第 ${index + 1} 条回复\n\n${'聊天内容应保持可见，输入区不应覆盖消息。\n\n'.repeat(4)}`,
      }],
    })),
  } as never,
  store.getThreadRuntime('attachments-test')!,
);
store.selectThread('attachments-test');
useConnectionStore.getState().setConnected(true);
Object.assign(window, {
  attachmentsTest: {
    state, timeline: useTimelineStore, drafts: useChatDraftStore, queue: useQueuedTurnStore,
  },
});
export function Fixture() {
  const threadId = useTimelineStore((s) => s.threadId);
  return (
    <main className="flex h-full overflow-hidden bg-background">
      <div className="isolate flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatHeader onToggleDiagnostics={() => {}} />
        <ChatTimeline key={threadId} />
        <ChatInput
          key={threadId}
          panelOpen={false}
          onTogglePanel={() => {}}
          onForkReadOnly={() => {}}
          onTakeover={() => {}}
          forkPending={false}
        />
      </div>
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

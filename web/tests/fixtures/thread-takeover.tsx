/** Exercises the real conflict banner and takeover dialog without touching any processes. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatInput } from '../../src/components/chat/chat-input';
import { ThreadTakeoverDialog } from '../../src/components/chat/thread-takeover-dialog';
import { useTimelineStore } from '../../src/stores/timeline-store';
import { client } from '../../src/generated/api/client.gen';
import i18n from '../../src/i18n';
import '../../src/index.css';

const threadId = '00000000-0000-7000-8000-000000000001';
const otherId = '00000000-0000-7000-8000-000000000002';
const params = new URLSearchParams(location.search);
const state = {
  requests: [] as { method: string; body: unknown }[],
  changed: false,
};
Object.assign(window, { takeoverTest: state });
await i18n.changeLanguage('zh-CN');
client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    if (!request.url.endsWith('/takeover'))
      return Response.json({ data: [], config: { data: null } });
    state.requests.push({
      method: request.method,
      body: request.method === 'POST' ? await request.json() : null,
    });
    if (request.method === 'POST') {
      if (state.changed)
        return Response.json(
          { errorCode: 'threads.takeover_changed', message: 'Writer changed' },
          { status: 409 },
        );
      return Response.json({
        thread: { id: threadId, turns: [], status: { type: 'idle' } },
        cwd: '/tmp',
      });
    }
    return Response.json({
      threadId,
      ownerPid: params.has('released') ? null : 4242,
      affectedThreadIds: params.has('released') ? [] : [threadId, otherId],
      confirmationToken: 'fixture-confirmation',
    });
  },
});
const store = useTimelineStore.getState();
store.ensureThreadState({ threadId, mode: 'writerConflict', title: '原会话' });
store.ensureThreadState({ threadId: otherId, title: '另一个正在运行的会话' });
store.selectThread(threadId);
export function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <main className="mx-auto max-w-3xl p-4">
      <ChatInput
        panelOpen={false}
        onTogglePanel={() => {}}
        onForkReadOnly={() => {}}
        onTakeover={() => setOpen(true)}
        forkPending={false}
      />
      {open && (
        <ThreadTakeoverDialog
          threadId={threadId}
          open
          onClose={() => setOpen(false)}
          onResumed={() =>
            useTimelineStore.getState().setThreadModeForThread(threadId, 'live')
          }
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <Fixture />
  </QueryClientProvider>,
);

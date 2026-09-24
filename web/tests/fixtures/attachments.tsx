/** Real ChatInput with local upload and turn responses; no files leave the browser. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatInput } from '../../src/components/chat/chat-input';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { client } from '../../src/generated/api/client.gen';
import { useTimelineStore } from '../../src/stores/timeline-store';
import { useConnectionStore } from '../../src/stores/connection-store';
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
    if (request.method === 'POST') {
      state.turns.push(await request.json());
      return Response.json({ turn: { id: 'new-turn' } });
    }
    return Response.json({
      data: [],
      config: {
        data: { sandboxMode: 'workspace-write', approvalPolicy: 'on-request' },
      },
    });
  },
});
const store = useTimelineStore.getState();
store.ensureThreadState({ threadId: 'attachments-test', cwd: '/work' });
store.ensureThreadState({ threadId: 'other-thread', cwd: '/work' });
store.selectThread('attachments-test');
useConnectionStore.getState().setConnected(true);
Object.assign(window, {
  attachmentsTest: { state, timeline: useTimelineStore },
});
export function Fixture() {
  const threadId = useTimelineStore((s) => s.threadId);
  return (
    <main className="flex min-h-dvh flex-col justify-end">
      <ChatInput
        key={threadId}
        panelOpen={false}
        onTogglePanel={() => {}}
        onForkReadOnly={() => {}}
        onTakeover={() => {}}
        forkPending={false}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <Fixture />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);

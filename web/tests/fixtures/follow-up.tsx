import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatInput } from '../../src/components/chat/chat-input';
import { client } from '../../src/generated/api/client.gen';
import i18n from '../../src/i18n';
import { useQueuedTurnStore } from '../../src/stores/queued-turn-store';
import { useTimelineStore } from '../../src/stores/timeline-store';
import '../../src/index.css';

const threadId = '00000000-0000-7000-8000-000000000003';
const state = { requests: [] as string[] };
Object.assign(window, { followUpTest: state });

await i18n.changeLanguage('zh-CN');
client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    state.requests.push(request.url);
    return Response.json({ data: [], config: { data: null } });
  },
});

useQueuedTurnStore.setState({ queues: {} });
const timeline = useTimelineStore.getState();
timeline.ensureThreadState({ threadId, mode: 'live', title: 'Active thread' });
timeline.selectThread(threadId);
timeline.setActiveTurnIdForThread(threadId, 'active-turn');
timeline.setLoadingForThread(threadId, true);

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <main className="mx-auto max-w-3xl p-4">
      <ChatInput
        panelOpen={false}
        onTogglePanel={() => {}}
        onForkReadOnly={() => {}}
        onTakeover={() => {}}
        forkPending={false}
      />
    </main>
  </QueryClientProvider>,
);

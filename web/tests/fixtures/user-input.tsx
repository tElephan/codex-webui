/** Browser fixture using the real turn renderer and API client with local responses. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TurnBlock } from '../../src/components/chat/turn-block';
import { useTimelineStore } from '../../src/stores/timeline-store';
import { client } from '../../src/generated/api/client.gen';
import i18n from '../../src/i18n';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const legacy = params.has('legacy');
const threadId = 'browser-question-test';
const turnId = 'browser-turn-test';
const state = { requests: [] as { url: string; body: unknown }[], fail: false };
Object.assign(window, { userInputTest: state });
await i18n.changeLanguage('en');
client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    state.requests.push({ url: request.url, body: await request.json() });
    if (state.fail)
      return Response.json(
        { message: 'Test submission failed' },
        { status: 503 },
      );
    return Response.json(
      request.url.endsWith('/steer')
        ? { turnId }
        : { turn: { id: 'next-turn' } },
    );
  },
});
const store = useTimelineStore.getState();
store.hydrateTimelineForThread(threadId, [
  {
    id: turnId,
    status: 'inProgress',
    items: legacy
      ? []
      : [
          {
            type: 'agentMessage',
            id: params.get('item') ?? 'async-question',
            text: '',
            questions: [
              {
                title: 'Choose a color',
                options: ['Blue (Recommended)', 'Green'],
              },
              { title: 'Where should it appear?', options: null },
            ],
          },
        ],
  },
] as never);
store.selectThread(threadId);
if (params.has('active')) store.setActiveTurnIdForThread(threadId, turnId);
if (legacy)
  store.addUserInputRequestForThread(threadId, {
    kind: 'userInput',
    threadId,
    turnId,
    itemId: 'legacy-question',
    requestId: 42,
    status: 'pending',
    questions: [
      {
        id: 'color',
        header: 'Color',
        question: 'Choose a color',
        isOther: true,
        isSecret: false,
        options: [
          { label: 'Blue', description: 'Recommended color' },
          { label: 'Green', description: 'Alternative color' },
        ],
      },
    ],
  });
export function Fixture() {
  const entry = useTimelineStore((s) =>
    s.timeline.find((item) => item.kind === 'turn'),
  );
  return (
    <main className="mx-auto max-w-2xl p-4">
      {entry?.kind === 'turn' && <TurnBlock entry={entry} />}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <Fixture />
  </QueryClientProvider>,
);

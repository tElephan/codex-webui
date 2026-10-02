/** Real composer and picker; the fake server inherits omitted model/effort just like Codex. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatInput } from '../../src/components/chat/chat-input';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { client } from '../../src/generated/api/client.gen';
import { modelsListModelsOptions } from '../../src/generated/api/@tanstack/react-query.gen';
import { useTimelineStore } from '../../src/stores/timeline-store';
import { useModelStore } from '../../src/stores/model-store';
import { useQueuedTurnStore } from '../../src/stores/queued-turn-store';
import { useConnectionStore } from '../../src/stores/connection-store';
import i18n from '../../src/i18n';
import '../../src/index.css';

await i18n.changeLanguage('en');
useModelStore.getState().clearOverrides();
useQueuedTurnStore.setState({ queues: {} });
const threadId = 'model-selection-test';
const cache = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
const models = [
  {
    id: 'a',
    model: 'model-a',
    displayName: 'Model A',
    isDefault: true,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: ['low', 'medium', 'high'].map(
      (reasoningEffort) => ({ reasoningEffort }),
    ),
  },
  {
    id: 'b',
    model: 'model-b',
    displayName: 'Model B',
    isDefault: false,
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: ['low', 'medium'].map((reasoningEffort) => ({
      reasoningEffort,
    })),
  },
];
const state = {
  requests: [] as { path: string; body: Record<string, unknown> }[],
  effectiveModel: 'model-b',
  effectiveEffort: 'medium',
  rejectSteer: false,
};
client.setConfig({
  baseUrl: location.origin,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      state.requests.push({ path, body });
      if (path.endsWith('/steer')) {
        return state.rejectSteer
          ? Response.json(
              { message: 'no active turn to steer' },
              { status: 400 },
            )
          : Response.json({ turnId: 'active-turn' });
      }
      state.effectiveModel =
        (body.model as string | undefined) ?? state.effectiveModel;
      state.effectiveEffort =
        (body.effort as string | undefined) ?? state.effectiveEffort;
      return Response.json({ turn: { id: `turn-${state.requests.length}` } });
    }
    if (path === '/api/models')
      return Response.json({ data: models, nextCursor: null });
    if (path === '/api/codex/config')
      return Response.json({
        config: { model: 'model-a', model_reasoning_effort: 'high' },
      });
    return Response.json({ data: [], groups: [], config: { data: {} } });
  },
});
const timeline = useTimelineStore.getState();
timeline.ensureThreadState({ threadId, cwd: '/work' });
timeline.selectThread(threadId);
useConnectionStore.getState().setConnected(true);
Object.assign(window, {
  modelSelectionTest: {
    state,
    finish: () =>
      useTimelineStore.getState().clearActiveTurnForThread(threadId),
    activate: () => {
      useTimelineStore
        .getState()
        .setActiveTurnIdForThread(threadId, 'active-turn');
      useTimelineStore.getState().setLoadingForThread(threadId, true);
    },
    refreshCatalog: () =>
      cache.setQueryData(modelsListModelsOptions().queryKey, {
        data: [],
        nextCursor: null,
      }),
    restoreCatalog: () =>
      cache.setQueryData(modelsListModelsOptions().queryKey, {
        data: models,
        nextCursor: null,
      }),
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cache}>
      <TooltipProvider>
        <main className="flex h-full flex-col justify-end bg-background">
          <ChatInput
            panelOpen={false}
            onTogglePanel={() => {}}
            onForkReadOnly={() => {}}
            onTakeover={() => {}}
            forkPending={false}
          />
        </main>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);

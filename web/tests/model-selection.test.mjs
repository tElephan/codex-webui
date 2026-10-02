import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.document = { querySelector: () => null };
globalThis.window = {
  location: { origin: 'http://localhost' },
  localStorage: storage,
};

const config = { model: 'model-a', model_reasoning_effort: 'high' };
const models = [
  {
    model: 'model-a',
    isDefault: true,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: ['low', 'medium', 'high'].map(
      (reasoningEffort) => ({ reasoningEffort }),
    ),
  },
  {
    model: 'model-b',
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: ['low', 'medium'].map((reasoningEffort) => ({
      reasoningEffort,
    })),
  },
];
let vite,
  resolve,
  options,
  modelStore,
  timeline,
  receipts,
  queue,
  submit,
  client,
  cache,
  queryKeys;
let requests, respond;

before(async () => {
  vite = await createServer({
    root: webRoot,
    configFile: false,
    resolve: { alias: { '@': `${webRoot}src` } },
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
  });
  ({ resolveModelSelection: resolve, getTurnModelOptions: options } =
    await vite.ssrLoadModule('/src/lib/model-selection.ts'));
  modelStore = (await vite.ssrLoadModule('/src/stores/model-store.ts'))
    .useModelStore;
  timeline = (await vite.ssrLoadModule('/src/stores/timeline-store.ts'))
    .useTimelineStore;
  receipts = (await vite.ssrLoadModule('/src/stores/async-user-input-store.ts'))
    .useAsyncUserInputStore;
  queue = await vite.ssrLoadModule('/src/stores/queued-turn-store.ts');
  submit = (await vite.ssrLoadModule('/src/lib/submit-async-user-input.ts'))
    .submitAsyncUserInput;
  client = (await vite.ssrLoadModule('/src/generated/api/client.gen.ts'))
    .client;
  cache = (await vite.ssrLoadModule('/src/lib/query-client.ts')).queryClient;
  queryKeys = await vite.ssrLoadModule(
    '/src/generated/api/@tanstack/react-query.gen.ts',
  );
  client.setConfig({
    baseUrl: 'http://localhost',
    fetch: async (request) => {
      requests.push({ url: request.url, body: await request.json() });
      return respond(request);
    },
  });
});
after(async () => {
  cache?.clear();
  await vite?.close();
});
beforeEach(() => {
  requests = [];
  respond = () => Response.json({ turn: { id: 'next-turn' } });
  modelStore.getState().clearOverrides();
  cache.clear();
  cache.setQueryData(queryKeys.codexConfigReadConfigOptions().queryKey, {
    config,
  });
  cache.setQueryData(queryKeys.modelsListModelsOptions().queryKey, {
    data: models,
  });
  timeline.getState().hydrateTimelineForThread('thread-a', []);
  timeline.getState().clearActiveTurnForThread('thread-a');
  receipts.setState({ answers: {} });
  queue.useQueuedTurnStore.setState({ queues: {} });
});

test('displayed defaults are explicit request options, so a previous model cannot be inherited', () => {
  assert.deepEqual(options(), { model: 'model-a', effort: 'high' });
  modelStore.getState().setModelOverride('model-b');
  assert.deepEqual(options(), { model: 'model-b', effort: 'low' });
  modelStore.getState().setModelOverride('model-a');
  assert.deepEqual(options(), { model: 'model-a', effort: 'high' });
});

test('switching models uses its own supported effort and rejects an incompatible saved effort', () => {
  const result = resolve(
    { modelOverride: 'model-b', effortOverride: 'high' },
    config,
    models,
  );
  assert.equal(result.effort, 'low');
  assert.equal(result.defaultEffort, 'low');
  const unsupportedConfig = resolve(
    { modelOverride: null, effortOverride: null },
    { ...config, model_reasoning_effort: 'ultra' },
    models,
  );
  assert.equal(unsupportedConfig.effort, 'medium');
});

test('choosing the default effort still sends it explicitly after a nondefault effort', () => {
  modelStore.getState().setEffortOverride('low');
  assert.equal(options().effort, 'low');
  modelStore.getState().setEffortOverride('high');
  assert.equal(options().effort, 'high');
});

test('catalog refreshes cannot silently discard an explicit model or effort', async () => {
  modelStore.getState().setModelOverride('model-b');
  modelStore.getState().setEffortOverride('medium');
  await modelStore.persist.rehydrate();
  cache.setQueryData(queryKeys.modelsListModelsOptions().queryKey, {
    data: [],
  });
  assert.deepEqual(options(), { model: 'model-b', effort: 'medium' });
});

test('queued turns retain the resolved selection from enqueue time', async () => {
  queue.useQueuedTurnStore.getState().enqueue({
    threadId: 'thread-a',
    input: [{ type: 'text', text: 'Next', text_elements: [] }],
    displayText: 'Next',
    ...options(),
  });
  modelStore.getState().setModelOverride('model-b');
  await queue.dispatchNextQueuedTurn('thread-a');
  assert.equal(requests[0].body.model, 'model-a');
  assert.equal(requests[0].body.effort, 'high');
});

const questions = [
  {
    id: 'color',
    question: 'Choose',
    options: null,
    isOther: true,
    isSecret: false,
    header: '',
  },
];
const answers = { color: { answers: ['Blue'] } };

test('async answers that start a new turn use the same selection as the composer', async () => {
  modelStore.getState().setModelOverride('model-b');
  await submit('thread-a', 'question', questions, answers, cache);
  assert.equal(requests[0].body.model, 'model-b');
  assert.equal(requests[0].body.effort, 'low');
});

test('active async answers retain native steering without attempting a model override', async () => {
  timeline.getState().setActiveTurnIdForThread('thread-a', 'active-turn');
  modelStore.getState().setModelOverride('model-b');
  respond = () => Response.json({ turnId: 'active-turn' });
  await submit('thread-a', 'question', questions, answers, cache);
  assert.ok(requests[0].url.endsWith('/steer'));
  assert.deepEqual(Object.keys(requests[0].body), ['input']);
});

test('a steer rejected after completion carries the chosen model into the fallback turn', async () => {
  timeline.getState().setActiveTurnIdForThread('thread-a', 'active-turn');
  modelStore.getState().setModelOverride('model-b');
  respond = (request) => {
    if (request.url.endsWith('/steer')) {
      modelStore.getState().setModelOverride('model-a');
      return Response.json({ message: 'no active turn' }, { status: 400 });
    }
    return Response.json({ turn: { id: 'next-turn' } });
  };
  await submit('thread-a', 'question', questions, answers, cache);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.model, 'model-b');
  assert.equal(requests[1].body.effort, 'low');
});

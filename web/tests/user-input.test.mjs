/** Run with: node --test web/tests/user-input.test.mjs (uses the installed Vite compiler). */
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const memory = new Map();
globalThis.sessionStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};
globalThis.document = { querySelector: () => null };
globalThis.window = { location: { origin: 'http://localhost' } };

let vite, parsers, timeline, receipts, submit, client, notify;
let requests, respond;
const questions = [{ title: 'Choose a color', options: ['Blue', 'Green'] }];
const answers = { 0: { answers: ['Green'] } };
const wireItem = {
  type: 'agentMessage',
  id: 'question-item',
  text: '',
  questions,
};

before(async () => {
  vite = await createServer({
    root: webRoot,
    configFile: false,
    cacheDir: `${webRoot}node_modules/.vite-user-input-test`,
    resolve: { alias: { '@': `${webRoot}src` } },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  parsers = await vite.ssrLoadModule('/src/lib/user-input-parsers.ts');
  timeline = (await vite.ssrLoadModule('/src/stores/timeline-store.ts'))
    .useTimelineStore;
  receipts = (await vite.ssrLoadModule('/src/stores/async-user-input-store.ts'))
    .useAsyncUserInputStore;
  submit = (await vite.ssrLoadModule('/src/lib/submit-async-user-input.ts'))
    .submitAsyncUserInput;
  client = (await vite.ssrLoadModule('/src/generated/api/client.gen.ts'))
    .client;
  notify = (await vite.ssrLoadModule('/src/hooks/notification-handlers.ts'))
    .handleNotification;
  client.setConfig({
    baseUrl: 'http://localhost',
    fetch: async (request) => {
      requests.push({ url: request.url, body: await request.json() });
      return respond(request);
    },
  });
});
after(async () => {
  await vite?.close();
});
beforeEach(() => {
  requests = [];
  respond = () => Response.json({ turn: { id: 'new-turn' } });
  receipts.setState({ answers: {} });
  timeline.getState().hydrateTimelineForThread('thread-a', []);
  timeline.getState().hydrateTimelineForThread('thread-b', []);
});

function history() {
  return [{ id: 'turn-a', status: 'completed', items: [wireItem] }];
}
function currentItem() {
  return timeline
    .getState()
    .getThreadRuntime('thread-a')
    .timeline.find((entry) => entry.kind === 'turn').items[0];
}

test('parses async choices, free text and malformed payloads without losing question indices', () => {
  const parsed = parsers.parseAsyncUserInputQuestions([
    null,
    ...questions,
    { title: 'Explain' },
    { title: 'Duplicates', options: ['A', null, 'A', ''] },
  ]);
  assert.deepEqual(
    parsed.map((q) => q.id),
    ['1', '2', '3'],
  );
  assert.equal(parsed[0].options[1].label, 'Green');
  assert.equal(parsed[0].isOther, true);
  assert.equal(parsed[1].options, null);
  assert.equal(parsed[2].options.length, 1);
  assert.deepEqual(parsers.parseAsyncUserInputQuestions({}), []);
});

test('history hydration preserves question-only assistant messages', () => {
  timeline.getState().hydrateTimelineForThread('thread-a', history());
  assert.equal(currentItem().content, '');
  assert.equal(currentItem().questions[0].question, 'Choose a color');
});

test('started, delta and completed events keep structured questions', () => {
  const ctx = {
    threadId: 'thread-a',
    updateTurnItem: (turnId, itemId, updater) => {
      timeline
        .getState()
        .updateTurnItemForThread('thread-a', turnId, itemId, updater);
    },
  };
  const params = { threadId: 'thread-a', turnId: 'turn-a', item: wireItem };
  notify('item/started', params, ctx);
  notify(
    'item/agentMessage/delta',
    {
      threadId: 'thread-a',
      turnId: 'turn-a',
      itemId: 'question-item',
      delta: 'Please choose',
    },
    ctx,
  );
  assert.equal(currentItem().questions[0].options.length, 2);
  notify('item/completed', params, ctx);
  assert.equal(currentItem().questions[0].question, 'Choose a color');
});

test('active-turn answers go to steer with the question and selected answer', async () => {
  timeline.getState().setActiveTurnIdForThread('thread-a', 'turn-a');
  respond = () => Response.json({ turnId: 'turn-a' });
  await submit(
    'thread-a',
    'question-item',
    parsers.parseAsyncUserInputQuestions(questions),
    answers,
  );
  assert.equal(
    requests[0].url,
    'http://localhost/api/threads/thread-a/turns/turn-a/steer',
  );
  assert.equal(requests[0].body.input[0].text, 'Choose a color\nGreen');
  assert.deepEqual(
    receipts.getState().answers['["thread-a","question-item"]'],
    answers,
  );
});

test('idle-turn answers start a turn and stay attached to their original thread', async () => {
  await submit(
    'thread-a',
    'question-item',
    parsers.parseAsyncUserInputQuestions(questions),
    answers,
  );
  assert.equal(requests[0].url, 'http://localhost/api/threads/thread-a/turns');
  assert.equal(
    timeline.getState().getThreadRuntime('thread-b').timeline.length,
    0,
  );
  assert.equal(
    timeline.getState().getThreadRuntime('thread-a').timeline[0].content,
    'Choose a color\nGreen',
  );
});

test('a turn that finishes during submission falls back to a new turn', async () => {
  timeline.getState().setActiveTurnIdForThread('thread-a', 'turn-a');
  respond = () =>
    requests.length === 1
      ? Response.json({ message: 'no active turn to steer' }, { status: 400 })
      : Response.json({ turn: { id: 'new-turn' } });
  await submit(
    'thread-a',
    'question-item',
    parsers.parseAsyncUserInputQuestions(questions),
    answers,
  );
  assert.equal(requests.length, 2);
  assert.ok(requests[1].url.endsWith('/turns'));
});

test('failed submissions remain unanswered and can be retried without fallback sends', async () => {
  timeline.getState().setActiveTurnIdForThread('thread-a', 'turn-a');
  respond = () => Response.json({ message: 'Try again' }, { status: 503 });
  await assert.rejects(
    submit(
      'thread-a',
      'question-item',
      parsers.parseAsyncUserInputQuestions(questions),
      answers,
    ),
  );
  assert.deepEqual(receipts.getState().answers, {});
  assert.equal(requests.length, 1);
  respond = () => Response.json({ turnId: 'turn-a' });
  await submit(
    'thread-a',
    'question-item',
    parsers.parseAsyncUserInputQuestions(questions),
    answers,
  );
  assert.equal(requests.length, 2);
});

test('duplicate submits send one response, and accepted answers survive rehydration', async () => {
  const parsed = parsers.parseAsyncUserInputQuestions(questions);
  await Promise.all([
    submit('thread-a', 'question-item', parsed, answers),
    submit('thread-a', 'question-item', parsed, answers),
  ]);
  await receipts.persist.rehydrate();
  await submit('thread-a', 'question-item', parsed, answers);
  assert.equal(requests.length, 1);
});

test('read-only threads and incomplete answers cannot submit', async () => {
  timeline
    .getState()
    .ensureThreadState({ threadId: 'thread-readonly', mode: 'readOnly' });
  await assert.rejects(
    submit(
      'thread-readonly',
      'question-item',
      parsers.parseAsyncUserInputQuestions(questions),
      answers,
    ),
  );
  await assert.rejects(
    submit(
      'thread-b',
      'question-item',
      parsers.parseAsyncUserInputQuestions(questions),
      {},
    ),
  );
  assert.equal(requests.length, 0);
});

/** Run with node --test web/tests/thread-sync.test.mjs. Exercises real stores and HTTP recovery. */
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
Object.assign(globalThis, {
  localStorage: storage,
  sessionStorage: storage,
  document: { querySelector: () => null },
  window: { localStorage: storage, location: { origin: 'http://localhost' } },
});
let vite, timeline, sync, syncState, queue, client;
let requests, respond;
const turn = (id = 'turn-a', status = 'completed', text = 'Full response') => ({
  id,
  status,
  items: [
    {
      type: 'userMessage',
      id: `user-${id}`,
      content: [{ type: 'text', text: 'Question' }],
    },
    { type: 'agentMessage', id: `answer-${id}`, text },
  ],
});
const thread = (turns = [turn()], id = 'thread-a') => ({
  id,
  cwd: '/work',
  preview: 'Question',
  name: 'Recovered',
  status: {
    type: turns.some((t) => t.status === 'inProgress') ? 'active' : 'idle',
    activeFlags: [],
  },
  turns,
});
const runtime = (id = 'thread-a') => timeline.getState().getThreadRuntime(id);
function seed(id = 'thread-a', status = 'inProgress') {
  timeline.getState().ensureThreadState({ threadId: id });
  const before = runtime(id);
  assert.equal(
    timeline
      .getState()
      .reconcileThreadSnapshot(
        thread([turn('turn-a', status, 'Partial')], id),
        before,
      ),
    true,
  );
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

before(async () => {
  vite = await createServer({
    root: webRoot,
    configFile: false,
    cacheDir: `${webRoot}node_modules/.vite-thread-sync-test`,
    resolve: { alias: { '@': `${webRoot}src` } },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  timeline = (await vite.ssrLoadModule('/src/stores/timeline-store.ts'))
    .useTimelineStore;
  sync = await vite.ssrLoadModule('/src/lib/thread-sync.ts');
  syncState = (await vite.ssrLoadModule('/src/stores/thread-sync-store.ts'))
    .useThreadSyncStore;
  queue = (await vite.ssrLoadModule('/src/stores/queued-turn-store.ts'))
    .useQueuedTurnStore;
  client = (await vite.ssrLoadModule('/src/generated/api/client.gen.ts'))
    .client;
  client.setConfig({
    baseUrl: 'http://localhost',
    fetch: async (request) => {
      requests.push({
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return respond(request);
    },
  });
});
after(async () => {
  await vite?.close();
});
beforeEach(() => {
  timeline.setState(timeline.getInitialState(), true);
  syncState.setState({ threads: {} });
  queue.setState({ queues: {} });
  requests = [];
  respond = (request) => {
    const path = new URL(request.url).pathname;
    if (path === '/api/threads/thread-a')
      return Response.json({ thread: thread() });
    if (path === '/api/pending-approvals')
      return Response.json({ requests: [] });
    if (path.endsWith('/turn-errors')) return Response.json({ errors: [] });
    return Response.json({ turns: [] });
  };
});

test('recovers missing output and completion atomically without submitting a turn', async () => {
  seed();
  const observed = [];
  const unsubscribe = timeline.subscribe(() =>
    observed.push([runtime().loading, runtime().activeTurnId]),
  );
  await sync.syncThread('thread-a');
  unsubscribe();
  assert.equal(
    runtime().timeline.find((e) => e.kind === 'turn').items[0].content,
    'Full response',
  );
  assert.equal(runtime().loading, false);
  assert.equal(runtime().activeTurnId, null);
  assert.equal(syncState.getState().threads['thread-a'].status, 'idle');
  assert.ok(observed.every(([loading, active]) => loading === Boolean(active)));
  assert.ok(requests.every((request) => request.method === 'GET'));
});

test('a slow snapshot cannot overwrite newer deltas; a subsequent sync fills missed history', async () => {
  seed();
  const read = deferred();
  const fallback = respond;
  respond = (request) =>
    new URL(request.url).pathname === '/api/threads/thread-a'
      ? read.promise
      : fallback(request);
  const task = sync.syncThread('thread-a');
  timeline
    .getState()
    .updateTurnItemForThread('thread-a', 'turn-a', 'answer-turn-a', (item) => ({
      ...item,
      content: 'Newest live delta',
      completed: false,
    }));
  read.resolve(
    Response.json({
      thread: thread([turn('turn-a', 'inProgress', 'Old snapshot')]),
    }),
  );
  await task;
  assert.equal(
    runtime().timeline.find((e) => e.kind === 'turn').items[0].content,
    'Newest live delta',
  );
  assert.equal(runtime().activeTurnId, 'turn-a');
  assert.equal(syncState.getState().threads['thread-a'].status, 'pending');
  respond = fallback;
  await sync.syncThread('thread-a', true);
  assert.equal(runtime().activeTurnId, null);
});

test('late active snapshots never resurrect a turn completed during the read', async () => {
  seed();
  const before = runtime();
  timeline
    .getState()
    .updateCurrentTurnForThread('thread-a', 'turn-a', (items) => ({
      items,
      completed: true,
    }));
  timeline.getState().clearActiveTurnForThread('thread-a');
  assert.equal(
    timeline
      .getState()
      .reconcileThreadSnapshot(thread([turn('turn-a', 'inProgress')]), before),
    false,
  );
  // Even a subsequent stale history read cannot regress a known completion.
  assert.equal(
    timeline
      .getState()
      .reconcileThreadSnapshot(
        thread([turn('turn-a', 'inProgress')]),
        runtime(),
      ),
    false,
  );
  assert.equal(runtime().activeTurnId, null);
});

test('changing selected conversations during recovery never mixes their timelines', async () => {
  seed();
  seed('thread-b', 'completed');
  const read = deferred();
  const fallback = respond;
  respond = (request) =>
    new URL(request.url).pathname === '/api/threads/thread-a'
      ? read.promise
      : fallback(request);
  timeline.getState().selectThread('thread-a');
  const task = sync.syncThread('thread-a');
  timeline.getState().selectThread('thread-b');
  const otherTimeline = timeline.getState().timeline;
  read.resolve(Response.json({ thread: thread() }));
  await task;
  assert.equal(timeline.getState().threadId, 'thread-b');
  assert.equal(timeline.getState().timeline, otherTimeline);
  assert.equal(runtime().activeTurnId, null);
});

test('preserves plans, diffs and system messages while filling missed output', () => {
  seed();
  const store = timeline.getState();
  const plan = {
    explanation: 'Plan',
    steps: [{ step: 'Work', status: 'inProgress' }],
  };
  store.updateTurnPlanForThread('thread-a', 'turn-a', plan);
  store.updateTurnDiffForThread('thread-a', 'turn-a', '+new');
  store.addSystemMessageForThread(
    'thread-a',
    'Restart notice',
    'info',
    'turn-a',
  );
  assert.equal(store.reconcileThreadSnapshot(thread(), runtime()), true);
  const entry = runtime().timeline.find((e) => e.kind === 'turn');
  assert.deepEqual(entry.plan, plan);
  assert.equal(entry.diff, '+new');
  assert.ok(
    runtime().timeline.some(
      (e) => e.kind === 'system' && e.content === 'Restart notice',
    ),
  );
});

test('keeps optimistic submissions and newly started turns when the snapshot predates them', () => {
  seed('thread-a', 'completed');
  timeline.getState().addUserMessageForThread('thread-a', 'New question');
  assert.equal(
    timeline.getState().reconcileThreadSnapshot(thread(), runtime()),
    false,
  );
  timeline.getState().setActiveTurnIdForThread('thread-a', 'turn-b');
  timeline
    .getState()
    .updateCurrentTurnForThread('thread-a', 'turn-b', () => ({
      items: [],
      completed: false,
    }));
  assert.equal(
    timeline.getState().reconcileThreadSnapshot(thread(), runtime()),
    false,
  );
  assert.equal(runtime().activeTurnId, 'turn-b');
});

test('hydrates empty active turns and terminal failed/interrupted turns correctly', () => {
  timeline.getState().ensureThreadState({ threadId: 'thread-a' });
  const store = timeline.getState();
  assert.equal(
    store.reconcileThreadSnapshot(
      thread([{ id: 'turn-a', status: 'inProgress', items: [] }]),
      runtime(),
    ),
    true,
  );
  assert.equal(runtime().timeline[0].completed, false);
  assert.equal(runtime().activeTurnId, 'turn-a');
  const finished = thread([turn('turn-a', 'interrupted')]);
  finished.status = { type: 'active', activeFlags: ['waitingOnApproval'] };
  assert.equal(store.reconcileThreadSnapshot(finished, runtime()), true);
  assert.equal(
    runtime().timeline.find((e) => e.kind === 'turn').completed,
    true,
  );
  assert.equal(runtime().threadStatus.type, 'idle');
});

const approval = {
  requestId: 42,
  method: 'item/commandExecution/requestApproval',
  threadId: 'thread-a',
  turnId: 'turn-a',
  itemId: 'command',
  status: 'pending',
  params: { command: 'pwd' },
};
test('recovers missing approval and blocking input cards, and resolutions from another window', async () => {
  seed();
  const fallback = respond;
  let pending = [
    approval,
    {
      ...approval,
      requestId: 43,
      method: 'item/tool/requestUserInput',
      itemId: 'question',
      params: {
        questions: [{ id: 'q', header: 'Choice', question: 'Continue?' }],
      },
    },
  ];
  respond = (request) =>
    new URL(request.url).pathname === '/api/pending-approvals'
      ? Response.json({ requests: pending })
      : fallback(request);
  await sync.syncThread('thread-a');
  assert.equal(runtime().approvals.command.status, 'pending');
  assert.equal(runtime().userInputRequests['43'].status, 'pending');
  pending = [];
  await sync.syncThread('thread-a', true);
  assert.equal(runtime().approvals.command.status, 'resolved');
  assert.equal(runtime().userInputRequests['43'].status, 'resolved');
});

test('a stale pending-request response cannot reopen a request just resolved by a socket event', async () => {
  seed();
  const read = deferred();
  const fallback = respond;
  respond = (request) =>
    new URL(request.url).pathname === '/api/pending-approvals'
      ? read.promise
      : fallback(request);
  const task = sync.syncThread('thread-a');
  timeline.getState().resolveApprovalByRequestIdForThread('thread-a', 42);
  read.resolve(Response.json({ requests: [approval] }));
  await task;
  assert.equal(runtime().approvals.command.status, 'resolved');
  await sync.syncThread('thread-a', true);
  assert.equal(runtime().approvals.command.status, 'resolved');
});

test('deduplicates focus/reconnect reads and exposes recoverable errors', async () => {
  seed();
  const read = deferred();
  const fallback = respond;
  respond = (request) =>
    new URL(request.url).pathname === '/api/threads/thread-a'
      ? read.promise
      : fallback(request);
  const first = sync.syncThread('thread-a');
  assert.equal(first, sync.syncThread('thread-a', true));
  read.resolve(Response.json({ message: 'Unavailable' }, { status: 503 }));
  await first;
  assert.equal(syncState.getState().threads['thread-a'].status, 'error');
  assert.equal(runtime().activeTurnId, 'turn-a');
  assert.equal(
    requests.filter((r) => r.path === '/api/threads/thread-a').length,
    1,
  );
  respond = fallback;
  await sync.syncThread('thread-a', true);
  assert.equal(syncState.getState().threads['thread-a'].status, 'idle');
});

test('a missed completion dispatches an already queued follow-up only once', async () => {
  seed();
  queue
    .getState()
    .enqueue({
      threadId: 'thread-a',
      input: [{ type: 'text', text: 'Follow up', text_elements: [] }],
      displayText: 'Follow up',
    });
  const fallback = respond;
  respond = (request) =>
    request.method === 'POST'
      ? Response.json({ turn: { id: 'turn-b' } })
      : fallback(request);
  await Promise.all([sync.syncThread('thread-a'), sync.syncThread('thread-a')]);
  // Queue dispatch runs asynchronously after recovery.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests.filter((r) => r.method === 'POST').length, 1);
  assert.equal(runtime().activeTurnId, 'turn-b');
  assert.equal(queue.getState().queues['thread-a'], undefined);
});

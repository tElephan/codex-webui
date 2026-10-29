import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const root = 'https://example.test/codex/';

function setup() {
  const listeners = {};
  const entries = new Map();
  const requests = [];
  const response = () => {
    const value = new Response('asset');
    Object.defineProperty(value, 'type', { value: 'basic' });
    return value;
  };
  const key = (request) => typeof request === 'string' ? request : request.url;
  const cache = {
    match: async (request) => entries.get(key(request)),
    put: async (request, value) => entries.set(key(request), value),
  };
  const context = createContext({
    URL, Response,
    self: { registration: { scope: root }, addEventListener: (type, handler) => { listeners[type] = handler; } },
    caches: { match: cache.match, open: async () => cache },
    fetch: async (request, options) => { requests.push({ url: key(request), options }); return response(); },
  });
  runInContext(source, context);
  const event = (path, destination = 'script') => {
    const pending = [];
    let result;
    listeners.fetch({
      request: { url: new URL(path, root).href, method: 'GET', destination },
      respondWith: (value) => { result = value; },
      waitUntil: (value) => pending.push(value),
    });
    return { result, pending };
  };
  return { entries, requests, response, event, listeners };
}

test('cached build chunks, styles and fonts never trigger another network fetch', async () => {
  const { entries, requests, response, event } = setup();
  for (const [path, destination] of [['assets/app-abc.js', 'script'], ['assets/app-abc.css', 'style'], ['assets/font-abc.woff2', 'font']]) {
    entries.set(new URL(path, root).href, response());
    const request = event(path, destination);
    assert.equal((await request.result).status, 200);
    await Promise.all(request.pending);
  }
  assert.equal(requests.length, 0);
});

test('a new build URL is downloaded once and cached', async () => {
  const { entries, requests, event } = setup();
  await event('assets/new-build.js').result;
  await event('assets/new-build.js').result;
  assert.equal(requests.length, 1);
  assert.ok(entries.has(`${root}assets/new-build.js`));
});

test('mutable icons still revalidate and private requests bypass the worker', async () => {
  const { entries, requests, response, event } = setup();
  entries.set(`${root}favicon.png`, response());
  const request = event('favicon.png', 'image');
  await request.result;
  await Promise.all(request.pending);
  assert.equal(requests.length, 1);
  for (const path of ['api/files/serve', 'socket.io/', 'https://other.test/assets/app.js'])
    assert.equal(event(path).result, undefined);
});

test('asset warming reuses existing cache entries and the browser HTTP cache', async () => {
  const { entries, requests, response, listeners } = setup();
  entries.set(`${root}assets/existing.js`, response());
  const warm = async () => {
    let pending;
    listeners.message({
      data: { type: 'CACHE_APP_ASSETS', urls: [`${root}assets/existing.js`, `${root}assets/new.js`, `${root}api/private`, 'https://other.test/a.js'] },
      waitUntil: (value) => { pending = value; },
    });
    await pending;
  };
  await warm();
  await warm();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${root}assets/new.js`);
  assert.equal(requests[0].options.cache, 'force-cache');
});

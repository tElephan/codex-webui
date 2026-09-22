import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const key = 'codex.webui.theme';
let vite, storage, media, appliedDark, themeColor;

beforeEach(async () => {
  storage = new Map();
  media = new EventTarget();
  media.matches = false;
  globalThis.window = { matchMedia: () => media };
  globalThis.localStorage = {
    getItem: (name) => storage.get(name) ?? null,
    setItem: (name, value) => storage.set(name, value),
    removeItem: (name) => storage.delete(name),
  };
  window.localStorage = globalThis.localStorage;
  globalThis.document = {
    documentElement: { classList: { toggle: (_, value) => { appliedDark = value; } } },
    querySelector: () => ({ setAttribute: (_, value) => { themeColor = value; } }),
  };
  vite = await createServer({
    root: webRoot,
    configFile: false,
    cacheDir: `${webRoot}node_modules/.vite-theme-test`,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
});
afterEach(async () => { await vite.close(); });
const load = async () => (await vite.ssrLoadModule('/src/stores/theme-store.ts')).useThemeStore;
function systemDark(value) {
  media.matches = value;
  media.dispatchEvent(new Event('change'));
}
function verify(store, mode, dark) {
  assert.equal(store.getState().mode, mode);
  assert.equal(store.getState().dark, dark);
  assert.equal(appliedDark, dark);
  assert.equal(themeColor, dark ? '#17191f' : '#f7f8fa');
}

test('new users follow system changes in both directions', async () => {
  const store = await load();
  verify(store, 'system', false);
  systemDark(true);
  verify(store, 'system', true);
  systemDark(false);
  verify(store, 'system', false);
  assert.deepEqual(JSON.parse(storage.get(key)).state, { mode: 'system' });
});

test('manual modes ignore system changes; returning to system resolves immediately', async () => {
  const store = await load();
  store.getState().setMode('dark');
  systemDark(false);
  verify(store, 'dark', true);
  store.getState().setMode('light');
  systemDark(true);
  verify(store, 'light', false);
  store.getState().setMode('system');
  verify(store, 'system', true);
  store.getState().toggleDark();
  verify(store, 'light', false);
  systemDark(false);
  systemDark(true);
  verify(store, 'light', false);
});

test('rehydrating system mode uses current OS preference rather than stale resolved dark', async () => {
  storage.set(key, JSON.stringify({ state: { mode: 'system', dark: false }, version: 0 }));
  media.matches = true;
  const store = await load();
  verify(store, 'system', true);
});

for (const dark of [false, true]) {
  test(`preserves legacy boolean preference ${dark}`, async () => {
    storage.set(key, JSON.stringify({ state: { dark }, version: 0 }));
    media.matches = !dark;
    const store = await load();
    verify(store, dark ? 'dark' : 'light', dark);
    systemDark(!dark);
    verify(store, dark ? 'dark' : 'light', dark);
  });
}

for (const mode of ['dark', 'light']) {
  test(`migrates legacy plain string ${mode}`, async () => {
    storage.set(key, mode);
    const store = await load();
    verify(store, mode, mode === 'dark');
    store.getState().setMode('system');
    assert.deepEqual(JSON.parse(storage.get(key)).state, { mode: 'system' });
  });
}

test('stored manual mode survives reload independently of OS preference', async () => {
  storage.set(key, JSON.stringify({ state: { mode: 'light' }, version: 0 }));
  media.matches = true;
  verify(await load(), 'light', false);
});

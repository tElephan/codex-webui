import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
let vite;
let collapseBranchThreads;

before(async () => {
  vite = await createServer({
    root: webRoot,
    configFile: false,
    cacheDir: `${webRoot}node_modules/.vite-sidebar-test`,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  ({ collapseBranchThreads } = await vite.ssrLoadModule(
    '/src/components/chat/sidebar/sidebar-types.ts',
  ));
});

after(async () => {
  await vite?.close();
});

test('shows a resumed session once using its newest rollout', () => {
  const older = { id: 'same', updatedAt: 10, path: 'old.jsonl' };
  const newer = { id: 'same', updatedAt: 30, path: 'new.jsonl' };
  const other = { id: 'other', updatedAt: 20 };

  assert.deepEqual(collapseBranchThreads([older, other, newer], new Map()), [
    newer,
    other,
  ]);
});

test('folds branches after deduplicating their root', () => {
  const oldRoot = { id: 'root', updatedAt: 10, path: 'old.jsonl' };
  const newRoot = { id: 'root', updatedAt: 30, path: 'new.jsonl' };
  const branch = { id: 'branch', updatedAt: 40 };
  const other = { id: 'other', updatedAt: 35 };

  assert.deepEqual(
    collapseBranchThreads(
      [oldRoot, other, branch, newRoot],
      new Map([['branch', 'root']]),
    ),
    [{ ...newRoot, updatedAt: 40 }, other],
  );
});

const CACHE_PREFIX = 'codex-webui';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v1`;
const ASSET_CACHE = `${CACHE_PREFIX}-assets-v1`;
const SCOPE_URL = new URL(self.registration.scope);
const APP_ROOT_URL = new URL('./', SCOPE_URL).href;

const SHELL_URLS = [
  APP_ROOT_URL,
  new URL('manifest.webmanifest', SCOPE_URL).href,
  new URL('favicon.svg', SCOPE_URL).href,
  new URL('apple-touch-icon.png', SCOPE_URL).href,
  new URL('icon-192.png', SCOPE_URL).href,
  new URL('icon-512.png', SCOPE_URL).href,
  new URL('icon-maskable-512.png', SCOPE_URL).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith(`${CACHE_PREFIX}-`) &&
                  key !== SHELL_CACHE &&
                  key !== ASSET_CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

function getAppPath(url) {
  if (url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) {
    return null;
  }
  return url.pathname.slice(SCOPE_URL.pathname.length);
}

function isPrivateAppRequest(url) {
  const appPath = getAppPath(url);
  return appPath === null || appPath.startsWith('api/') || appPath.startsWith('socket.io/');
}

async function cacheResponse(cacheName, request, response) {
  if (
    response.ok &&
    response.type === 'basic' &&
    !response.headers.get('cache-control')?.includes('no-store')
  ) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    await cacheResponse(SHELL_CACHE, APP_ROOT_URL, response);
    return response;
  } catch {
    return (await caches.match(APP_ROOT_URL)) ?? Response.error();
  }
}

async function handleAsset(request, event) {
  const cached = await caches.match(request);
  const networkResponse = fetch(request).then((response) =>
    cacheResponse(ASSET_CACHE, request, response),
  );

  if (cached) {
    event.waitUntil(networkResponse.catch(() => undefined));
    return cached;
  }

  return networkResponse;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || isPrivateAppRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (['script', 'style', 'font', 'image', 'worker'].includes(request.destination)) {
    event.respondWith(handleAsset(request, event));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_APP_ASSETS' || !Array.isArray(event.data.urls)) return;

  const urls = event.data.urls.filter((value) => {
    if (typeof value !== 'string') return false;
    return !isPrivateAppRequest(new URL(value, SCOPE_URL));
  });

  event.waitUntil(caches.open(ASSET_CACHE).then((cache) => cache.addAll(urls)));
});

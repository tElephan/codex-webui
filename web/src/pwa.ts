import { withBasePath } from './base-path';

function getBuildAssetUrls(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
      'script[src], link[rel="stylesheet"][href]',
    ),
    (element) =>
      element instanceof HTMLScriptElement ? element.src : element.href,
  ).filter(Boolean);
}

export function registerPwaServiceWorker(): void {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(withBasePath('/service-worker.js'), {
        scope: withBasePath('/'),
        updateViaCache: 'none',
      })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        registration.active?.postMessage({
          type: 'CACHE_APP_ASSETS',
          urls: getBuildAssetUrls(),
        });
      })
      .catch((error: unknown) => {
        console.warn('PWA service worker registration failed', error);
      });
  });
}

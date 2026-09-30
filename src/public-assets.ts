import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { normalizeForwardedPrefix, renderIndexHtml } from './public-base-path';

/** Nest's Fastify loader enumerates files at startup. Assets use a live route. */
export const PUBLIC_STATIC_OPTIONS = {
  fallthrough: true,
  globIgnore: ['assets/**'],
  etag: false,
  lastModified: false,
};

/** Keeps the SPA and lazy modules available when a build is published live. */
export function registerPublicAssets(
  server: FastifyInstance,
  publicDir: string,
): void {
  server.register(fastifyStatic, {
    root: join(publicDir, 'assets'),
    prefix: '/assets/',
    wildcard: true,
    decorateReply: false,
    maxAge: '1y',
    immutable: true,
  });

  server.addHook('onSend', async (request, reply, payload) => {
    const contentType = String(reply.getHeader('content-type') ?? '');
    if (
      (request.method !== 'GET' && request.method !== 'HEAD') ||
      request.url.startsWith('/api') ||
      !contentType.startsWith('text/html')
    ) {
      return payload;
    }

    // Read the current build instead of keeping the startup version in memory.
    const indexHtml = await readFile(
      join(publicDir, 'index.html'),
      'utf8',
    ).catch(() => null);
    if (indexHtml === null) return payload;

    if (payload instanceof Readable) payload.destroy();
    reply.removeHeader('content-length');
    reply.removeHeader('etag');
    reply.removeHeader('last-modified');
    // Revalidate the app shell while still allowing the PWA's offline cache.
    reply.header('Cache-Control', 'no-cache');
    const basePath = normalizeForwardedPrefix(
      request.headers['x-forwarded-prefix'],
    );
    return request.method === 'HEAD'
      ? null
      : renderIndexHtml(indexHtml, basePath);
  });
}

import compress from '@fastify/compress';
import type { FastifyInstance } from 'fastify';
import { constants } from 'node:zlib';

/** Compress JSON and build assets for both direct and reverse-proxy deployments. */
export async function registerHttpCompression(
  server: FastifyInstance,
): Promise<void> {
  await server.register(compress, {
    threshold: 1024,
    encodings: ['br', 'gzip'],
    brotliOptions: {
      params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
    },
  });
}

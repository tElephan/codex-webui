import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ServeStaticModule } from '@nestjs/serve-static';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { registerHttpCompression } from './http-compression';
import { PUBLIC_STATIC_OPTIONS, registerPublicAssets } from './public-assets';

@Controller('api')
class TestApiController {
  @Get('status')
  status() {
    return { status: 'ok' };
  }

  @Get('history')
  history() {
    return { text: 'A long conversation with repeated text. '.repeat(200) };
  }
}

@Module({})
class TestAppModule {}

describe('public build assets', () => {
  let app: NestFastifyApplication;
  let publicDir: string;
  const html = (version: string) =>
    `<base href="__CODEX_WEBUI_BASE_PATH__"><script type="module" src="./assets/${version}.js"></script>`;

  beforeEach(async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'codex-public-assets-'));
    await mkdir(join(publicDir, 'assets'));
    await writeFile(join(publicDir, 'index.html'), html('old'));
    await writeFile(
      join(publicDir, 'assets', 'old.js'),
      'export default "old";',
    );
    app = await NestFactory.create<NestFastifyApplication>(
      {
        module: TestAppModule,
        imports: [
          ServeStaticModule.forRoot({
            rootPath: publicDir,
            serveStaticOptions: PUBLIC_STATIC_OPTIONS,
          }),
        ],
        controllers: [TestApiController],
      },
      new FastifyAdapter(),
      { logger: false },
    );
    await registerHttpCompression(app.getHttpAdapter().getInstance());
    registerPublicAssets(app.getHttpAdapter().getInstance(), publicDir);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
    await rm(publicDir, { recursive: true, force: true });
  });

  it('serves the latest HTML and new lazy modules without a restart', async () => {
    const before = await app.inject({ url: '/files' });
    expect(before.body).toContain('old.js');

    await writeFile(
      join(publicDir, 'assets', 'new.js'),
      'export default "new";',
    );
    await writeFile(join(publicDir, 'index.html'), html('new'));

    const after = await app.inject({
      url: '/files',
      headers: { 'x-forwarded-prefix': '/codex' },
    });
    expect(after.statusCode).toBe(200);
    expect(after.body).toContain('<base href="/codex/">');
    expect(after.body).toContain('new.js');
    expect(after.headers['cache-control']).toBe('no-cache');
    expect(after.headers.etag).toBeUndefined();
    expect(after.headers['last-modified']).toBeUndefined();

    for (const version of ['old', 'new']) {
      const asset = await app.inject({ url: `/assets/${version}.js` });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers['content-type']).toContain('javascript');
      expect(asset.headers['cache-control']).toContain('immutable');
      expect(asset.body).toBe(`export default "${version}";`);
    }
  });

  it('returns 404 for missing modules instead of the HTML shell', async () => {
    const asset = await app.inject({ url: '/assets/missing.js' });
    expect(asset.statusCode).toBe(404);
    expect(asset.headers['content-type']).not.toContain('text/html');
    expect(asset.body).not.toContain('<script');
  });

  it('keeps HEAD requests and API responses working', async () => {
    const head = await app.inject({ method: 'HEAD', url: '/' });
    expect(head.statusCode).toBe(200);
    expect(head.headers['cache-control']).toBe('no-cache');
    expect(head.body).toBe('');

    const api = await app.inject({ url: '/api/status' });
    expect(api.statusCode).toBe(200);
    expect(api.json()).toEqual({ status: 'ok' });
  });

  it('revalidates HTML even when a client supplies stale validators', async () => {
    await writeFile(join(publicDir, 'index.html'), html('new'));
    const response = await app.inject({
      url: '/',
      headers: {
        'if-none-match': 'W/"previous-build"',
        'if-modified-since': 'Thu, 01 Oct 2099 00:00:00 GMT',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('new.js');
  });

  it('compresses JSON and lazy modules while preserving cache headers', async () => {
    const source = 'export const message = "repeated source text";\n'.repeat(
      200,
    );
    await writeFile(join(publicDir, 'assets', 'large.js'), source);

    for (const encoding of ['br', 'gzip']) {
      const decompress = encoding === 'br' ? brotliDecompressSync : gunzipSync;
      for (const url of ['/api/history', '/assets/large.js']) {
        const response = await app.inject({
          url,
          headers: { 'accept-encoding': encoding },
        });
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-encoding']).toBe(encoding);
        expect(response.headers.vary).toContain('accept-encoding');
        const decoded = decompress(response.rawPayload).toString();
        expect(response.rawPayload.length).toBeLessThan(decoded.length / 2);
        if (url.startsWith('/assets/')) {
          expect(decoded).toBe(source);
          expect(response.headers['cache-control']).toContain('immutable');
        } else {
          expect(JSON.parse(decoded)).toEqual(
            new TestApiController().history(),
          );
        }
      }
    }
  });

  it('serves uncompressed responses to clients without encoding support', async () => {
    const response = await app.inject({ url: '/api/history' });
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.json()).toEqual(new TestApiController().history());

    const small = await app.inject({
      url: '/api/status',
      headers: { 'accept-encoding': 'br, gzip' },
    });
    expect(small.headers['content-encoding']).toBeUndefined();
    expect(small.json()).toEqual({ status: 'ok' });
  });

  it('compresses the current HTML after rewriting its proxy base path', async () => {
    await writeFile(
      join(publicDir, 'index.html'),
      html('new') + ' '.repeat(2000),
    );
    const response = await app.inject({
      url: '/files',
      headers: { 'accept-encoding': 'br', 'x-forwarded-prefix': '/codex' },
    });
    expect(response.headers['content-encoding']).toBe('br');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(brotliDecompressSync(response.rawPayload).toString()).toContain(
      '<base href="/codex/">',
    );
  });
});

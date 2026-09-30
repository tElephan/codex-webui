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
import { PUBLIC_STATIC_OPTIONS, registerPublicAssets } from './public-assets';

@Controller('api')
class TestApiController {
  @Get('status')
  status() {
    return { status: 'ok' };
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
});

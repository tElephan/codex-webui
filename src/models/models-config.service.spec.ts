import { Test, TestingModule } from '@nestjs/testing';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelsService } from './models.service';
import { CodexService } from '../codex/codex.service';
import type { v2 } from '../codex/codex-schema';

describe('ModelsService configured catalog', () => {
  let service: ModelsService;
  let tempDirectories: string[];
  const mockCodex = { request: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelsService,
        { provide: CodexService, useValue: mockCodex },
      ],
    }).compile();

    service = module.get(ModelsService);
    mockCodex.request.mockReset();
    tempDirectories = [];
  });

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it('uses configured membership, order, metadata, and pagination', async () => {
    const catalogPath = await writeCatalog([
      catalogModel('beta'),
      catalogModel('alpha'),
      catalogModel('custom', {
        display_name: 'Custom Model',
        default_reasoning_level: 'ultra',
        supported_reasoning_levels: [
          { effort: 'max', description: 'Maximum' },
          { effort: 'ultra', description: 'Delegated' },
        ],
        input_modalities: ['text', 'image'],
      }),
      catalogModel('beta'),
      catalogModel('hidden', { visibility: 'hide' }),
    ]);
    const runtimeModels = [
      model('alpha', { displayName: 'Alpha runtime' }),
      model('beta', { displayName: 'Beta runtime' }),
    ];
    mockCatalogRequests(catalogPath, runtimeModels, 'alpha');

    const firstPage = await service.listModels({ limit: 2 });
    const secondPage = await service.listModels({
      cursor: firstPage.nextCursor,
      limit: 2,
      includeHidden: true,
    });

    expect(firstPage.data.map((item) => item.model)).toEqual(['beta', 'alpha']);
    expect(firstPage.nextCursor).toBe('2');
    expect(firstPage.data[1]).toMatchObject({
      displayName: 'Alpha runtime',
      isDefault: true,
    });
    expect(secondPage.data.map((item) => item.model)).toEqual([
      'custom',
      'hidden',
    ]);
    expect(secondPage.data[0]).toMatchObject({
      displayName: 'Custom Model',
      defaultReasoningEffort: 'ultra',
      inputModalities: ['text', 'image'],
      supportedReasoningEfforts: [
        { reasoningEffort: 'max', description: 'Maximum' },
        { reasoningEffort: 'ultra', description: 'Delegated' },
      ],
    });
    expect(secondPage.data[1].hidden).toBe(true);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('keeps a configured default selectable when absent from the catalog', async () => {
    const catalogPath = await writeCatalog([catalogModel('alpha')]);
    mockCatalogRequests(
      catalogPath,
      [model('configured-default')],
      'configured-default',
    );

    const result = await service.listModels();

    expect(result.data.map((item) => item.model)).toEqual([
      'configured-default',
      'alpha',
    ]);
    expect(result.data[0].isDefault).toBe(true);
  });

  it('keeps the configured default visible when its catalog entry is hidden', async () => {
    const catalogPath = await writeCatalog([
      catalogModel('configured-default', { visibility: 'hide' }),
    ]);
    mockCatalogRequests(catalogPath, [], 'configured-default');

    const result = await service.listModels();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      model: 'configured-default',
      hidden: false,
      isDefault: true,
    });
  });

  it('falls back to app-server when the configured catalog is invalid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'models-service-'));
    tempDirectories.push(directory);
    const catalogPath = join(directory, 'models.json');
    await writeFile(catalogPath, '{invalid', 'utf8');
    const response = { data: [model('fallback')], nextCursor: null };
    mockCodex.request.mockImplementation((method: string) => {
      if (method === 'config/read') {
        return Promise.resolve(configResponse(catalogPath));
      }
      if (method === 'model/list') return Promise.resolve(response);
      return Promise.reject(new Error(`Unexpected method: ${method}`));
    });

    await expect(service.listModels({ limit: 3 })).resolves.toBe(response);
    expect(mockCodex.request).toHaveBeenCalledWith('model/list', { limit: 3 });
  });

  async function writeCatalog(models: Record<string, unknown>[]) {
    const directory = await mkdtemp(join(tmpdir(), 'models-service-'));
    tempDirectories.push(directory);
    const catalogPath = join(directory, 'models.json');
    await writeFile(catalogPath, JSON.stringify({ models }), 'utf8');
    return catalogPath;
  }

  function mockCatalogRequests(
    catalogPath: string,
    models: v2.Model[],
    defaultModel: string,
  ) {
    mockCodex.request.mockImplementation((method: string) => {
      if (method === 'config/read') {
        return Promise.resolve(configResponse(catalogPath, defaultModel));
      }
      if (method === 'model/list') {
        return Promise.resolve({ data: models, nextCursor: null });
      }
      return Promise.reject(new Error(`Unexpected method: ${method}`));
    });
  }
});

function configResponse(
  catalogPath?: string,
  defaultModel = 'gpt-4',
): v2.ConfigReadResponse {
  return {
    config: {
      model: defaultModel,
      ...(catalogPath ? { model_catalog_json: catalogPath } : {}),
    } as v2.Config,
    origins: {},
    layers: null,
  };
}

function catalogModel(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    display_name: slug.toUpperCase(),
    description: `${slug} description`,
    visibility: 'list',
    default_reasoning_level: 'medium',
    supported_reasoning_levels: [],
    ...overrides,
  };
}

function model(id: string, overrides: Partial<v2.Model> = {}): v2.Model {
  return {
    id,
    model: id,
    upgrade: null,
    upgradeInfo: null,
    availabilityNux: null,
    displayName: id,
    description: '',
    modelSpecialty: null,
    hidden: false,
    supportedReasoningEfforts: [],
    defaultReasoningEffort: 'medium',
    inputModalities: ['text'],
    supportsPersonality: false,
    multiAgentVersion: null,
    additionalSpeedTiers: [],
    serviceTiers: [],
    defaultServiceTier: null,
    availableAccessPrograms: null,
    isDefault: false,
    ...overrides,
  };
}

/**
 * Handles model listing using the effective Codex model catalog.
 */
import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CodexService } from '../codex/codex.service';
import type { v2 } from '../codex/codex-schema';

interface CatalogServiceTier {
  id?: unknown;
  name?: unknown;
  description?: unknown;
}

interface CatalogModel {
  slug: string;
  display_name?: unknown;
  description?: unknown;
  visibility?: unknown;
  default_reasoning_level?: unknown;
  supported_reasoning_levels?: unknown;
  input_modalities?: unknown;
  additional_speed_tiers?: unknown;
  service_tiers?: unknown;
}

@Injectable()
export class ModelsService {
  private readonly logger = new Logger(ModelsService.name);

  constructor(private readonly codex: CodexService) {}

  /**
   * Lists models from the catalog selected by the effective config.toml.
   * App-server data supplies runtime metadata; the configured catalog controls
   * membership and order. If no custom catalog is configured, app-server
   * pagination is passed through unchanged.
   *
   * @param params - Optional pagination and filter parameters
   * @returns Paginated model list
   */
  async listModels(
    params: v2.ModelListParams = {},
  ): Promise<v2.ModelListResponse> {
    const configured = await this.readConfiguredCatalog();
    if (!configured) {
      return this.codex.request<v2.ModelListResponse>('model/list', params);
    }

    const appServerModels = await this.listAllAppServerModels();
    const bySlug = new Map(
      appServerModels.map((model) => [model.model, model] as const),
    );
    const includeHidden = params.includeHidden === true;
    const seen = new Set<string>();
    const data: v2.Model[] = [];

    for (const entry of configured.models) {
      if (seen.has(entry.slug)) continue;
      seen.add(entry.slug);

      const hidden =
        entry.visibility === 'hide' && entry.slug !== configured.defaultModel;
      if (hidden && !includeHidden) continue;

      const runtimeModel = bySlug.get(entry.slug);
      data.push(
        runtimeModel
          ? {
              ...runtimeModel,
              hidden,
              isDefault: entry.slug === configured.defaultModel,
            }
          : this.modelFromCatalog(entry, configured.defaultModel),
      );
    }

    if (configured.defaultModel && !seen.has(configured.defaultModel)) {
      const runtimeDefault = bySlug.get(configured.defaultModel);
      data.unshift(
        runtimeDefault
          ? { ...runtimeDefault, hidden: false, isDefault: true }
          : this.modelFromCatalog(
              { slug: configured.defaultModel },
              configured.defaultModel,
            ),
      );
    }

    return paginateModels(data, params);
  }

  private async readConfiguredCatalog(): Promise<{
    models: CatalogModel[];
    defaultModel: string | null;
  } | null> {
    let response: v2.ConfigReadResponse;
    try {
      response = await this.codex.request<v2.ConfigReadResponse>(
        'config/read',
        { includeLayers: false } satisfies v2.ConfigReadParams,
      );
    } catch (error) {
      this.logger.warn(
        `Unable to read effective Codex config; using app-server model list: ${errorMessage(error)}`,
      );
      return null;
    }

    const configuredPath = response.config?.model_catalog_json;
    if (typeof configuredPath !== 'string' || !configuredPath.trim()) {
      return null;
    }

    try {
      const filePath = configuredPath.startsWith('file://')
        ? fileURLToPath(configuredPath)
        : configuredPath;
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
      const models = parseCatalogModels(parsed);
      if (!models) {
        throw new Error('catalog must contain a models array');
      }
      return {
        models,
        defaultModel:
          typeof response.config.model === 'string'
            ? response.config.model
            : null,
      };
    } catch (error) {
      this.logger.warn(
        `Unable to read configured model catalog ${configuredPath}; using app-server model list: ${errorMessage(error)}`,
      );
      return null;
    }
  }

  private async listAllAppServerModels(): Promise<v2.Model[]> {
    const models: v2.Model[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null | undefined;

    do {
      const response = await this.codex.request<v2.ModelListResponse>(
        'model/list',
        {
          cursor,
          limit: 100,
          includeHidden: true,
        } satisfies v2.ModelListParams,
      );
      models.push(...response.data);
      cursor = response.nextCursor;
      if (cursor && seenCursors.has(cursor)) {
        this.logger.warn(
          `Codex model/list repeated cursor ${cursor}; stopping pagination`,
        );
        break;
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);

    return models;
  }

  private modelFromCatalog(
    entry: CatalogModel,
    defaultModel: string | null,
  ): v2.Model {
    const supportedReasoningEfforts = Array.isArray(
      entry.supported_reasoning_levels,
    )
      ? entry.supported_reasoning_levels.flatMap((value) => {
          if (!isRecord(value) || typeof value.effort !== 'string') return [];
          return [
            {
              reasoningEffort: value.effort,
              description:
                typeof value.description === 'string' ? value.description : '',
            },
          ];
        })
      : [];
    const defaultReasoningEffort =
      typeof entry.default_reasoning_level === 'string'
        ? entry.default_reasoning_level
        : (supportedReasoningEfforts[0]?.reasoningEffort ?? 'medium');
    const inputModalities = Array.isArray(entry.input_modalities)
      ? entry.input_modalities.filter(isInputModality)
      : ['text' as const];

    return {
      id: entry.slug,
      model: entry.slug,
      upgrade: null,
      upgradeInfo: null,
      availabilityNux: null,
      displayName:
        typeof entry.display_name === 'string'
          ? entry.display_name
          : entry.slug,
      description:
        typeof entry.description === 'string' ? entry.description : '',
      modelSpecialty: null,
      hidden: entry.visibility === 'hide' && entry.slug !== defaultModel,
      supportedReasoningEfforts,
      defaultReasoningEffort,
      inputModalities,
      supportsPersonality: false,
      multiAgentVersion: null,
      additionalSpeedTiers: stringArray(entry.additional_speed_tiers),
      serviceTiers: parseServiceTiers(entry.service_tiers),
      defaultServiceTier: null,
      availableAccessPrograms: null,
      isDefault: entry.slug === defaultModel,
    };
  }
}

function parseCatalogModels(value: unknown): CatalogModel[] | null {
  if (!isRecord(value) || !Array.isArray(value.models)) return null;
  return value.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.slug !== 'string') return [];
    const slug = model.slug.trim();
    return slug ? [{ ...model, slug }] : [];
  });
}

function paginateModels(
  models: v2.Model[],
  params: v2.ModelListParams,
): v2.ModelListResponse {
  const parsedCursor = Number(params.cursor ?? 0);
  const start =
    Number.isSafeInteger(parsedCursor) && parsedCursor >= 0 ? parsedCursor : 0;
  const limit =
    typeof params.limit === 'number' &&
    Number.isSafeInteger(params.limit) &&
    params.limit > 0
      ? params.limit
      : models.length;
  const end = Math.min(start + limit, models.length);

  return {
    data: models.slice(start, end),
    nextCursor: end < models.length ? String(end) : null,
  };
}

function parseServiceTiers(value: unknown): v2.ModelServiceTier[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tier: CatalogServiceTier) => {
    if (!isRecord(tier) || typeof tier.id !== 'string') return [];
    return [
      {
        id: tier.id,
        name: typeof tier.name === 'string' ? tier.name : tier.id,
        description:
          typeof tier.description === 'string' ? tier.description : '',
      },
    ];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isInputModality(
  value: unknown,
): value is v2.Model['inputModalities'][number] {
  return value === 'text' || value === 'image' || value === 'audio';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

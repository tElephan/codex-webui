import type { QueryClient } from '@tanstack/react-query';
import type { ModelDto, StartTurnDto } from '@/generated/api';
import {
  codexConfigReadConfigOptions,
  modelsListModelsOptions,
} from '@/generated/api/@tanstack/react-query.gen';
import { useModelStore } from '@/stores/model-store';
import { queryClient } from './query-client';

type ReasoningEffort = NonNullable<StartTurnDto['effort']>;
type Selection = {
  modelOverride: string | null;
  effortOverride: ReasoningEffort | null;
};

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    typeof value === 'string' &&
    [
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
      'ultra',
    ].includes(value)
  );
}

/** Resolve the same explicit model/effort for both the picker and new turns. */
export function resolveModelSelection(
  selection: Selection,
  config: Record<string, unknown> | undefined,
  models: ModelDto[] = [],
) {
  const configModel = typeof config?.model === 'string' ? config.model : null;
  const model =
    selection.modelOverride ??
    configModel ??
    models.find((m) => m.isDefault)?.model ??
    null;
  const activeModel = models.find((m) => m.model === model);
  const supported = activeModel?.supportedReasoningEfforts ?? [];
  const accepts = (effort: unknown): effort is ReasoningEffort =>
    isReasoningEffort(effort) &&
    (supported.length === 0 ||
      supported.some((option) => option.reasoningEffort === effort));
  const configEffort =
    model === configModel ? config?.model_reasoning_effort : null;
  const defaultEffort = accepts(configEffort)
    ? configEffort
    : (activeModel?.defaultReasoningEffort ??
      supported[0]?.reasoningEffort ??
      null);
  const effort = accepts(selection.effortOverride)
    ? selection.effortOverride
    : defaultEffort;
  return { model, effort, activeModel, defaultEffort };
}

/** Omitting either option makes Codex inherit the previous turn, not the displayed default. */
export function getTurnModelOptions(
  client: QueryClient = queryClient,
): Pick<StartTurnDto, 'model' | 'effort'> {
  const config = client.getQueryData(
    codexConfigReadConfigOptions().queryKey,
  )?.config;
  const models = client.getQueryData(modelsListModelsOptions().queryKey)?.data;
  const { model, effort } = resolveModelSelection(
    useModelStore.getState(),
    config,
    models,
  );
  return {
    ...(model && { model }),
    ...(effort && { effort }),
  };
}

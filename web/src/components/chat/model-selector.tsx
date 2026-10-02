/**
 * Model and reasoning effort selector for the chat input area.
 * Displays current model + effort as a compact badge, opens a popover to change.
 */
import { Bot, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  codexConfigReadConfigOptions,
  modelsListModelsOptions,
} from '@/generated/api/@tanstack/react-query.gen';
import type { ModelDto } from '@/generated/api';
import { useModelStore } from '@/stores/model-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { resolveModelSelection } from '@/lib/model-selection';
import { cn } from '@/lib/utils';

type ReasoningEffort = ModelDto['defaultReasoningEffort'];

/** Fallback effort options when a model doesn't declare its own. */
const DEFAULT_EFFORTS: Array<{ reasoningEffort: ReasoningEffort }> = [
  { reasoningEffort: 'none' },
  { reasoningEffort: 'minimal' },
  { reasoningEffort: 'low' },
  { reasoningEffort: 'medium' },
  { reasoningEffort: 'high' },
  { reasoningEffort: 'xhigh' },
];

/** Short display label for a model. */
function modelLabel(model: ModelDto): string {
  return model.displayName || model.model;
}

/** Displays model picker and reasoning effort selector. */
export function ModelSelector() {
  const { t } = useTranslation();
  const modelOverride = useModelStore((s) => s.modelOverride);
  const effortOverride = useModelStore((s) => s.effortOverride);
  const setModelOverride = useModelStore((s) => s.setModelOverride);
  const setEffortOverride = useModelStore((s) => s.setEffortOverride);
  const hasActiveTurn = useTimelineStore((s) => !!s.activeTurnId);

  // Effective Codex config is the source of truth for model defaults.
  const { data: configData } = useQuery({
    ...codexConfigReadConfigOptions(),
    refetchOnWindowFocus: true,
  });
  // Full model list from dedicated endpoint (longer staleTime)
  const { data: modelsData } = useQuery({
    ...modelsListModelsOptions(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const config = configData?.config as Record<string, unknown> | undefined;
  const models = modelsData?.data?.filter((m) => !m.hidden) ?? [];
  const {
    model: activeModelId,
    activeModel,
    effort: activeEffort,
    defaultEffort,
  } = resolveModelSelection(
    { modelOverride, effortOverride },
    config,
    modelsData?.data,
  );

  const displayModel = activeModel
    ? modelLabel(activeModel)
    : (activeModelId ?? t('Default'));
  const displayEffort = activeEffort ?? '';

  const handleModelSelect = (model: ModelDto) => {
    // Default choices must also be sent explicitly to replace the thread's old settings.
    const next = resolveModelSelection(
      { modelOverride: model.model, effortOverride: null },
      config,
      modelsData?.data,
    );
    setModelOverride(model.model);
    setEffortOverride(next.effort);
  };

  const handleEffortSelect = (effort: ReasoningEffort) => {
    setEffortOverride(effort);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 rounded-lg px-2 text-xs"
          title={t('Model & reasoning effort')}
          aria-label={t('Model & reasoning effort')}
        >
          <Bot className="h-3.5 w-3.5" />
          <span className="max-w-24 truncate sm:max-w-[120px]">
            {displayModel}
          </span>
          {displayEffort && (
            <span className="hidden sm:inline text-muted-foreground">
              · {displayEffort}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        className="w-64 space-y-3 p-3 text-sm"
      >
        {hasActiveTurn && (
          <p className="text-xs text-muted-foreground">
            {t(
              'Model changes apply to the next turn. The current response keeps its model.',
            )}
          </p>
        )}
        {/* Model list */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            {t('Model')}
          </div>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                aria-pressed={model.model === activeModelId}
                onClick={() => handleModelSelect(model)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  model.model === activeModelId
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50',
                )}
              >
                <span className="truncate">{modelLabel(model)}</span>
                {model.isDefault && (
                  <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">
                    {t('default')}
                  </span>
                )}
              </button>
            ))}
            {models.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {t('No models available')}
              </p>
            )}
          </div>
        </div>

        {/* Reasoning effort — always shown, falls back to standard options */}
        <div className="space-y-1 border-t border-border pt-2">
          <div className="text-xs font-medium text-muted-foreground">
            {t('Reasoning effort')}
          </div>
          {(activeModel && activeModel.supportedReasoningEfforts.length > 0
            ? activeModel.supportedReasoningEfforts
            : DEFAULT_EFFORTS
          ).map((opt) => (
            <button
              key={opt.reasoningEffort}
              type="button"
              aria-pressed={opt.reasoningEffort === activeEffort}
              onClick={() => handleEffortSelect(opt.reasoningEffort)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                opt.reasoningEffort === activeEffort
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50',
              )}
            >
              <span>{opt.reasoningEffort}</span>
              {opt.reasoningEffort === defaultEffort && (
                <span className="text-[10px] text-muted-foreground">
                  {t('default')}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

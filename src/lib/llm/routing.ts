import { modelForTier } from './openai';
import type { TransportMode } from './transport';
import type { ModelTier } from './types';

/** The four tasks that route through the LLM provider abstraction. */
export type TaskKind = 'extract' | 'proposals' | 'upscale' | 'summaries';

/**
 * Subset of UserSettings the routing layer needs. Kept minimal so the
 * transport module doesn't import the full settings shape (avoids cycles).
 */
export interface RoutingSettings {
  localLlmEnabled: boolean;
  localLlmEndpoint: string | null;
  extractLocalModel: string | null;
  proposalsLocalModel: string | null;
  upscaleLocalModel: string | null;
  summariesLocalModel: string | null;
}

export interface PickedTransport {
  mode: TransportMode;
  /** Concrete model name to send to the endpoint. */
  model: string;
  /** Tag for `runs.provider`. */
  provider: 'openai' | 'local';
  /** Distinguish "user enabled local" from "fell back to cloud silently". */
  source: 'cloud' | 'local';
}

function localModelFor(settings: RoutingSettings, task: TaskKind): string | null {
  switch (task) {
    case 'extract':
      return settings.extractLocalModel;
    case 'proposals':
      return settings.proposalsLocalModel;
    case 'upscale':
      return settings.upscaleLocalModel;
    case 'summaries':
      return settings.summariesLocalModel;
  }
}

/**
 * Decide whether to route `task` through the local OpenAI-compatible endpoint
 * or the cloud edge function.
 *
 * Local is chosen iff:
 * - `localLlmEnabled` is true
 * - `localLlmEndpoint` is set
 * - the per-task model is set
 * - `forceCloud` is not true
 *
 * Otherwise falls back to cloud (with the per-task tier mapping). This makes
 * disabling the global toggle a clean kill-switch without resetting per-task
 * model strings.
 */
export function pickTransport(
  settings: RoutingSettings | undefined,
  task: TaskKind,
  fallbackTier: ModelTier,
  opts: { forceCloud?: boolean } = {},
): PickedTransport {
  if (settings && !opts.forceCloud && settings.localLlmEnabled && settings.localLlmEndpoint) {
    const localModel = localModelFor(settings, task);
    if (localModel && localModel.trim().length > 0) {
      return {
        mode: { kind: 'local', endpoint: settings.localLlmEndpoint },
        model: localModel.trim(),
        provider: 'local',
        source: 'local',
      };
    }
  }
  return {
    mode: { kind: 'cloud' },
    model: modelForTier(fallbackTier),
    provider: 'openai',
    source: 'cloud',
  };
}

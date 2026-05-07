import type { TransportMode } from "./transport.js";

export type TaskKind = "extract" | "proposals" | "upscale" | "summaries";

const TIER_TO_MODEL = {
  cheapest: "gpt-5.4-nano",
  medium: "gpt-5.4-mini",
  best: "gpt-5.4",
} as const;
export type ModelTier = keyof typeof TIER_TO_MODEL;

export function modelForTier(tier: ModelTier): string {
  return TIER_TO_MODEL[tier];
}

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
  model: string;
  provider: "openai" | "local";
  source: "cloud" | "local";
}

function localModelFor(
  settings: RoutingSettings,
  task: TaskKind,
): string | null {
  switch (task) {
    case "extract":
      return settings.extractLocalModel;
    case "proposals":
      return settings.proposalsLocalModel;
    case "upscale":
      return settings.upscaleLocalModel;
    case "summaries":
      return settings.summariesLocalModel;
  }
}

export function pickTransport(
  settings: RoutingSettings | undefined | null,
  task: TaskKind,
  fallbackTier: ModelTier,
  opts: { forceCloud?: boolean } = {},
): PickedTransport {
  if (
    settings &&
    !opts.forceCloud &&
    settings.localLlmEnabled &&
    settings.localLlmEndpoint
  ) {
    const localModel = localModelFor(settings, task);
    if (localModel && localModel.trim().length > 0) {
      return {
        mode: { kind: "local", endpoint: settings.localLlmEndpoint },
        model: localModel.trim(),
        provider: "local",
        source: "local",
      };
    }
  }
  return {
    mode: { kind: "cloud" },
    model: modelForTier(fallbackTier),
    provider: "openai",
    source: "cloud",
  };
}

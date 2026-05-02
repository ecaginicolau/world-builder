import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/features/auth/session';
import type { ModelTier } from '@/lib/llm';

export interface UserPreferences {
  autoExtractDebounceMs?: number;
  monitoringOpen?: boolean;
}

export interface UserSettings {
  prefs: UserPreferences;
  upscaleTier: ModelTier;
  proposalsTier: ModelTier;
  extractTier: ModelTier;
  summarizeTier: ModelTier;
  localLlmEnabled: boolean;
  localLlmEndpoint: string | null;
  extractLocalModel: string | null;
  proposalsLocalModel: string | null;
  upscaleLocalModel: string | null;
  summariesLocalModel: string | null;
}

interface UserSettingsRow {
  user_id: string;
  preferred_llm_model: string | null;
  ui_prefs: UserPreferences;
  upscale_tier: ModelTier | null;
  proposals_tier: ModelTier | null;
  extract_tier: ModelTier | null;
  summarize_tier: ModelTier | null;
  local_llm_enabled: boolean | null;
  local_llm_endpoint: string | null;
  extract_local_model: string | null;
  proposals_local_model: string | null;
  upscale_local_model: string | null;
  summaries_local_model: string | null;
  created_at: string;
  updated_at: string;
}

const settingsKey = (userId: string) => ['user_settings', userId] as const;

const SELECT_COLUMNS =
  'user_id, ui_prefs, upscale_tier, proposals_tier, extract_tier, summarize_tier, ' +
  'local_llm_enabled, local_llm_endpoint, extract_local_model, proposals_local_model, ' +
  'upscale_local_model, summaries_local_model';

const DEFAULT_SETTINGS: UserSettings = {
  prefs: {},
  upscaleTier: 'best',
  proposalsTier: 'medium',
  extractTier: 'cheapest',
  summarizeTier: 'cheapest',
  localLlmEnabled: false,
  localLlmEndpoint: null,
  extractLocalModel: null,
  proposalsLocalModel: null,
  upscaleLocalModel: null,
  summariesLocalModel: null,
};

function rowToSettings(row: Partial<UserSettingsRow> | null): UserSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    prefs: (row.ui_prefs as UserPreferences | undefined) ?? {},
    upscaleTier: row.upscale_tier ?? 'best',
    proposalsTier: row.proposals_tier ?? 'medium',
    extractTier: row.extract_tier ?? 'cheapest',
    summarizeTier: row.summarize_tier ?? 'cheapest',
    localLlmEnabled: row.local_llm_enabled ?? false,
    localLlmEndpoint: row.local_llm_endpoint ?? null,
    extractLocalModel: row.extract_local_model ?? null,
    proposalsLocalModel: row.proposals_local_model ?? null,
    upscaleLocalModel: row.upscale_local_model ?? null,
    summariesLocalModel: row.summaries_local_model ?? null,
  };
}

export function useUserSettings() {
  const session = useSession();
  const userId = session.status === 'authed' ? session.session.user.id : '';
  return useQuery<UserSettings, Error>({
    queryKey: settingsKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return rowToSettings(data as Partial<UserSettingsRow> | null);
    },
  });
}

interface UpdatePatch {
  prefsPatch?: Partial<UserPreferences>;
  upscaleTier?: ModelTier;
  proposalsTier?: ModelTier;
  extractTier?: ModelTier;
  summarizeTier?: ModelTier;
  localLlmEnabled?: boolean;
  localLlmEndpoint?: string | null;
  extractLocalModel?: string | null;
  proposalsLocalModel?: string | null;
  upscaleLocalModel?: string | null;
  summariesLocalModel?: string | null;
}

export function useUpdateUserSettings() {
  const session = useSession();
  const qc = useQueryClient();
  return useMutation<UserSettings, Error, UpdatePatch>({
    mutationFn: async (patch) => {
      if (session.status !== 'authed') throw new Error('not authenticated');
      const userId = session.session.user.id;
      const { data: current } = await supabase
        .from('user_settings')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle();
      const currentRow = current as Partial<UserSettingsRow> | null;
      const prevPrefs = (currentRow?.ui_prefs as UserPreferences | undefined) ?? {};
      const nextRow: Record<string, unknown> = {
        user_id: userId,
        ui_prefs: { ...prevPrefs, ...(patch.prefsPatch ?? {}) },
      };
      if (patch.upscaleTier !== undefined) nextRow.upscale_tier = patch.upscaleTier;
      if (patch.proposalsTier !== undefined) nextRow.proposals_tier = patch.proposalsTier;
      if (patch.extractTier !== undefined) nextRow.extract_tier = patch.extractTier;
      if (patch.summarizeTier !== undefined) nextRow.summarize_tier = patch.summarizeTier;
      if (patch.localLlmEnabled !== undefined) nextRow.local_llm_enabled = patch.localLlmEnabled;
      if (patch.localLlmEndpoint !== undefined) nextRow.local_llm_endpoint = patch.localLlmEndpoint;
      if (patch.extractLocalModel !== undefined) nextRow.extract_local_model = patch.extractLocalModel;
      if (patch.proposalsLocalModel !== undefined) nextRow.proposals_local_model = patch.proposalsLocalModel;
      if (patch.upscaleLocalModel !== undefined) nextRow.upscale_local_model = patch.upscaleLocalModel;
      if (patch.summariesLocalModel !== undefined) nextRow.summaries_local_model = patch.summariesLocalModel;
      const { data, error } = await supabase
        .from('user_settings')
        .upsert(nextRow, { onConflict: 'user_id' })
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return rowToSettings(data as Partial<UserSettingsRow>);
    },
    onSuccess: (next) => {
      if (session.status !== 'authed') return;
      qc.setQueryData(settingsKey(session.session.user.id), next);
    },
  });
}

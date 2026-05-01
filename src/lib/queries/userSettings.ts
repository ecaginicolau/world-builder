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
}

interface UserSettingsRow {
  user_id: string;
  preferred_llm_model: string | null;
  ui_prefs: UserPreferences;
  upscale_tier: ModelTier | null;
  proposals_tier: ModelTier | null;
  extract_tier: ModelTier | null;
  created_at: string;
  updated_at: string;
}

const settingsKey = (userId: string) => ['user_settings', userId] as const;

const DEFAULT_SETTINGS: UserSettings = {
  prefs: {},
  upscaleTier: 'best',
  proposalsTier: 'medium',
  extractTier: 'cheapest',
};

function rowToSettings(row: Partial<UserSettingsRow> | null): UserSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    prefs: (row.ui_prefs as UserPreferences | undefined) ?? {},
    upscaleTier: row.upscale_tier ?? 'best',
    proposalsTier: row.proposals_tier ?? 'medium',
    extractTier: row.extract_tier ?? 'cheapest',
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
        .select('user_id, ui_prefs, upscale_tier, proposals_tier, extract_tier')
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
        .select('ui_prefs, upscale_tier, proposals_tier, extract_tier')
        .eq('user_id', userId)
        .maybeSingle();
      const prevPrefs = (current?.ui_prefs as UserPreferences | null) ?? {};
      const nextRow: Record<string, unknown> = {
        user_id: userId,
        ui_prefs: { ...prevPrefs, ...(patch.prefsPatch ?? {}) },
      };
      if (patch.upscaleTier !== undefined) nextRow.upscale_tier = patch.upscaleTier;
      if (patch.proposalsTier !== undefined) nextRow.proposals_tier = patch.proposalsTier;
      if (patch.extractTier !== undefined) nextRow.extract_tier = patch.extractTier;
      const { data, error } = await supabase
        .from('user_settings')
        .upsert(nextRow, { onConflict: 'user_id' })
        .select('user_id, ui_prefs, upscale_tier, proposals_tier, extract_tier')
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

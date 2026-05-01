import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/features/auth/session';

export interface UserPreferences {
  autoExtractDebounceMs?: number;
  monitoringOpen?: boolean;
}

interface UserSettingsRow {
  user_id: string;
  preferred_llm_model: string | null;
  ui_prefs: UserPreferences;
  created_at: string;
  updated_at: string;
}

const settingsKey = (userId: string) => ['user_settings', userId] as const;

export function useUserSettings() {
  const session = useSession();
  const userId = session.status === 'authed' ? session.session.user.id : '';
  return useQuery<UserPreferences, Error>({
    queryKey: settingsKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('user_id, ui_prefs')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return ((data as Pick<UserSettingsRow, 'ui_prefs'> | null)?.ui_prefs ?? {}) as UserPreferences;
    },
  });
}

export function useUpdateUserSettings() {
  const session = useSession();
  const qc = useQueryClient();
  return useMutation<UserPreferences, Error, { patch: Partial<UserPreferences> }>({
    mutationFn: async ({ patch }) => {
      if (session.status !== 'authed') throw new Error('not authenticated');
      const userId = session.session.user.id;
      const { data: current } = await supabase
        .from('user_settings')
        .select('ui_prefs')
        .eq('user_id', userId)
        .maybeSingle();
      const prev = (current?.ui_prefs as UserPreferences | null) ?? {};
      const next = { ...prev, ...patch };
      const { data, error } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, ui_prefs: next }, { onConflict: 'user_id' })
        .select('ui_prefs')
        .single();
      if (error) throw error;
      return (data.ui_prefs as UserPreferences) ?? {};
    },
    onSuccess: (next) => {
      if (session.status !== 'authed') return;
      qc.setQueryData(settingsKey(session.session.user.id), next);
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ReaderSessionRow {
  id: string;
  share_link_id: string;
  reader_local_id: string;
  name: string;
  first_seen_at: string;
  last_seen_at: string;
}

export const readerSessionsKeys = {
  byLink: (linkId: string) => ['readerSessions', 'byLink', linkId] as const,
};

export function useReaderSessionsByLink(linkId: string) {
  return useQuery<ReaderSessionRow[], Error>({
    queryKey: readerSessionsKeys.byLink(linkId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reader_sessions')
        .select('*')
        .eq('share_link_id', linkId)
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReaderSessionRow[];
    },
    enabled: !!linkId,
  });
}

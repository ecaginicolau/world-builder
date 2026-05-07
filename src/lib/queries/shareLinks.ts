import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ShareLink {
  id: string;
  owner_id: string;
  world_id: string;
  book_id: string;
  token: string;
  label: string | null;
  active: boolean;
  allow_comments: boolean;
  include_drafts: boolean;
  expires_at: string | null;
  created_at: string;
}

export const shareLinksKeys = {
  byBook: (bookId: string) => ['shareLinks', 'byBook', bookId] as const,
  detail: (id: string) => ['shareLinks', 'detail', id] as const,
};

export function useShareLinksByBook(bookId: string) {
  return useQuery<ShareLink[], Error>({
    queryKey: shareLinksKeys.byBook(bookId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('share_links')
        .select('*')
        .eq('book_id', bookId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShareLink[];
    },
    enabled: !!bookId,
  });
}

export function useShareLink(linkId: string) {
  return useQuery<ShareLink, Error>({
    queryKey: shareLinksKeys.detail(linkId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('share_links')
        .select('*')
        .eq('id', linkId)
        .single();
      if (error) throw error;
      return data as ShareLink;
    },
    enabled: !!linkId,
  });
}

function newToken(): string {
  // 32-char hex token, unguessable.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

export function useCreateShareLink() {
  const qc = useQueryClient();
  return useMutation<
    ShareLink,
    Error,
    {
      worldId: string;
      bookId: string;
      ownerId: string;
      label?: string | null;
      allowComments: boolean;
      includeDrafts: boolean;
      expiresAt: string | null;
    }
  >({
    mutationFn: async (args) => {
      const { data, error } = await supabase
        .from('share_links')
        .insert({
          world_id: args.worldId,
          book_id: args.bookId,
          owner_id: args.ownerId,
          token: newToken(),
          label: args.label?.trim() || null,
          allow_comments: args.allowComments,
          include_drafts: args.includeDrafts,
          expires_at: args.expiresAt,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as ShareLink;
    },
    onSuccess: (link) => {
      void qc.invalidateQueries({ queryKey: shareLinksKeys.byBook(link.book_id) });
    },
  });
}

export function useUpdateShareLink() {
  const qc = useQueryClient();
  return useMutation<
    ShareLink,
    Error,
    {
      id: string;
      label?: string | null;
      active?: boolean;
      allowComments?: boolean;
      includeDrafts?: boolean;
      expiresAt?: string | null;
    }
  >({
    mutationFn: async (args) => {
      const patch: Record<string, unknown> = {};
      if (args.label !== undefined) patch.label = args.label;
      if (args.active !== undefined) patch.active = args.active;
      if (args.allowComments !== undefined) patch.allow_comments = args.allowComments;
      if (args.includeDrafts !== undefined) patch.include_drafts = args.includeDrafts;
      if (args.expiresAt !== undefined) patch.expires_at = args.expiresAt;
      const { data, error } = await supabase
        .from('share_links')
        .update(patch)
        .eq('id', args.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as ShareLink;
    },
    onSuccess: (link) => {
      qc.setQueryData(shareLinksKeys.detail(link.id), link);
      void qc.invalidateQueries({ queryKey: shareLinksKeys.byBook(link.book_id) });
    },
  });
}

export function useDeleteShareLink() {
  const qc = useQueryClient();
  return useMutation<{ id: string; bookId: string }, Error, { id: string; bookId: string }>({
    mutationFn: async ({ id, bookId }) => {
      const { error } = await supabase.from('share_links').delete().eq('id', id);
      if (error) throw error;
      return { id, bookId };
    },
    onSuccess: ({ bookId }) => {
      void qc.invalidateQueries({ queryKey: shareLinksKeys.byBook(bookId) });
    },
  });
}

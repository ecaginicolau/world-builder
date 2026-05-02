import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type TargetKind =
  | 'note'
  | 'entity'
  | 'event'
  | 'chapter'
  | 'book'
  | 'part'
  | 'link'
  | null;

export interface AgentActionRow {
  id: string;
  world_id: string;
  agent_session_id: string;
  action_kind: string;
  target_kind: TargetKind;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export type AgentActionRangeKey = 'today' | '7d' | '30d' | 'all';

export interface AgentActionFilter {
  session: string | 'all';
  targetKind: Exclude<TargetKind, null> | 'all';
  range: AgentActionRangeKey;
}

export interface AgentActionsPage {
  rows: AgentActionRow[];
  total: number;
}

export const agentActionsKeys = {
  page: (
    worldId: string | null,
    filter: AgentActionFilter,
    page: number,
    pageSize: number,
  ) => ['agentActions', 'page', worldId, filter, page, pageSize] as const,
  sessions: (worldId: string | null) =>
    ['agentActions', 'sessions', worldId] as const,
};

function rangeStart(range: AgentActionRangeKey): Date | null {
  const now = new Date();
  if (range === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === '7d') return new Date(now.getTime() - 7 * 24 * 3600_000);
  if (range === '30d') return new Date(now.getTime() - 30 * 24 * 3600_000);
  return null;
}

export function useAgentActionsPage(
  worldId: string | null,
  filter: AgentActionFilter,
  page: number,
  pageSize: number,
) {
  return useQuery<AgentActionsPage, Error>({
    queryKey: agentActionsKeys.page(worldId, filter, page, pageSize),
    enabled: !!worldId,
    queryFn: async () => {
      let q = supabase
        .from('agent_actions')
        .select(
          'id, world_id, agent_session_id, action_kind, target_kind, target_id, payload, created_at',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false });
      if (worldId) q = q.eq('world_id', worldId);
      if (filter.session !== 'all') q = q.eq('agent_session_id', filter.session);
      if (filter.targetKind !== 'all') q = q.eq('target_kind', filter.targetKind);
      const start = rangeStart(filter.range);
      if (start) q = q.gte('created_at', start.toISOString());
      q = q.range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as AgentActionRow[], total: count ?? 0 };
    },
  });
}

export interface AgentSessionSummary {
  agent_session_id: string;
  count: number;
  first_at: string;
  last_at: string;
}

export function useAgentSessions(worldId: string | null) {
  return useQuery<AgentSessionSummary[], Error>({
    queryKey: agentActionsKeys.sessions(worldId),
    enabled: !!worldId,
    queryFn: async () => {
      if (!worldId) return [];
      // No SQL aggregate via PostgREST without a view — pull recent rows and
      // aggregate client-side. Capped at 1000 most recent which is more than
      // enough for the agent activity UI's session selector.
      const { data, error } = await supabase
        .from('agent_actions')
        .select('agent_session_id, created_at')
        .eq('world_id', worldId)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const grouped = new Map<string, AgentSessionSummary>();
      for (const row of (data ?? []) as { agent_session_id: string; created_at: string }[]) {
        const existing = grouped.get(row.agent_session_id);
        if (existing) {
          existing.count += 1;
          if (row.created_at < existing.first_at) existing.first_at = row.created_at;
          if (row.created_at > existing.last_at) existing.last_at = row.created_at;
        } else {
          grouped.set(row.agent_session_id, {
            agent_session_id: row.agent_session_id,
            count: 1,
            first_at: row.created_at,
            last_at: row.created_at,
          });
        }
      }
      return Array.from(grouped.values()).sort((a, b) =>
        a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0,
      );
    },
  });
}

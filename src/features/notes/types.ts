export interface Note {
  id: string;
  world_id: string;
  owner_id: string;
  title: string | null;
  content: string;
  status: 'open' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface ChatThread {
  id: string;
  world_id: string;
  owner_id: string;
  parent_kind: 'note' | 'chapter' | 'entity';
  parent_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  owner_id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  model: string | null;
  provider: string | null;
  tokens_used: { prompt?: number; completion?: number } | null;
  created_at: string;
}

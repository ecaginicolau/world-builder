export interface TimelineEvent {
  id: string;
  world_id: string;
  owner_id: string;
  chronological_rank: string;
  title: string;
  description: string | null;
  tags: string[];
  source_note_id: string | null;
  created_at: string;
  updated_at: string;
}

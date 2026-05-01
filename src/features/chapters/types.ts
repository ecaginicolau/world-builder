export interface Book {
  id: string;
  world_id: string;
  owner_id: string;
  rank: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Part {
  id: string;
  book_id: string;
  world_id: string;
  owner_id: string;
  rank: string;
  title: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  part_id: string;
  world_id: string;
  owner_id: string;
  reading_rank: string;
  chronological_rank: string;
  title: string | null;
  draft: string;
  content: string;
  summary_s: string | null;
  summary_m: string | null;
  summary_l: string | null;
  status: 'draft' | 'published';
  published_at: string | null;
  source_note_id: string | null;
  created_at: string;
  updated_at: string;
}

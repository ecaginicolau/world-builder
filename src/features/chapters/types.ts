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
  title: string | null;
  final_version_id: string | null;
  summary_s: string | null;
  summary_m: string | null;
  summary_l: string | null;
  status: 'draft' | 'published';
  published_at: string | null;
  last_analyzed_at: string | null;
  source_note_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ChapterVersionOrigin = 'draft' | 'upscale' | 'manual_edit';

export interface ChapterVersion {
  id: string;
  chapter_id: string;
  world_id: string;
  owner_id: string;
  rank: string;
  parent_version_id: string | null;
  origin: ChapterVersionOrigin;
  user_prompt: string | null;
  text: string;
  run_id: string | null;
  created_at: string;
  updated_at: string;
}

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
  /** Null for preface chapters (book_id is set instead). */
  part_id: string | null;
  /** Set only for preface chapters; regular chapters reach the book via parts.book_id. */
  book_id: string | null;
  is_preface: boolean;
  world_id: string;
  owner_id: string;
  reading_rank: string;
  title: string | null;
  final_version_id: string | null;
  summary_s: string | null;
  summary_m: string | null;
  summary_l: string | null;
  chapter_header: string | null;
  chapter_footer: string | null;
  opening_illustration_id: string | null;
  status: 'draft' | 'published';
  published_at: string | null;
  last_analyzed_at: string | null;
  source_note_id: string | null;
  created_at: string;
  updated_at: string;
}

export type HeaderMode = 'none' | 'book_title' | 'chapter_title' | 'author' | 'alternating';
export type FooterPosition = 'outside' | 'center' | 'inside';
export type Align = 'left' | 'center' | 'right';

export interface BookEdition {
  id: string;
  book_id: string;
  world_id: string;
  owner_id: string;
  name: string;

  trim_width_mm: number;
  trim_height_mm: number;

  margin_inside_mm: number;
  margin_outside_mm: number;
  margin_top_mm: number;
  margin_bottom_mm: number;

  body_font: string;
  body_font_size_pt: number;
  body_line_height: number;
  body_justify: boolean;
  paragraph_indent_mm: number;

  chapter_title_font: string;
  chapter_title_size_pt: number;
  chapter_title_bold: boolean;
  chapter_title_italic: boolean;
  chapter_title_align: Align;
  drop_cap: boolean;

  header_mode: HeaderMode;
  header_show_on_chapter_first_page: boolean;
  header_font: string;
  header_size_pt: number;
  header_italic: boolean;

  footer_page_numbers: boolean;
  footer_position: FooterPosition;
  footer_show_on_chapter_first_page: boolean;
  footer_font: string;
  footer_size_pt: number;

  chapter_header_font: string;
  chapter_header_size_pt: number;
  chapter_header_italic: boolean;
  chapter_header_align: Align;

  chapter_footer_font: string;
  chapter_footer_size_pt: number;
  chapter_footer_italic: boolean;
  chapter_footer_align: Align;

  chapter_starts_on_recto: boolean;
  include_illustrations: boolean;

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

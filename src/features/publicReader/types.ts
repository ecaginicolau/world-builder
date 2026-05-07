export interface ResolvedLink {
  id: string;
  label: string | null;
  allow_comments: boolean;
  include_drafts: boolean;
  expires_at: string | null;
}

export interface ResolvedBook {
  id: string;
  title: string;
  description: string | null;
  rank: string;
}

export interface ResolvedPart {
  id: string;
  title: string | null;
  rank: string;
}

export interface ResolvedChapter {
  id: string;
  part_id: string;
  title: string | null;
  reading_rank: string;
  status: 'draft' | 'published';
  final_version_id: string;
}

export interface ReaderSession {
  id: string;
  share_link_id: string;
  reader_local_id: string;
  name: string;
  first_seen_at: string;
  last_seen_at: string;
}

export type AnnotationKind = 'up' | 'down' | 'comment';

export interface ReaderAnnotation {
  id: string;
  share_link_id: string;
  reader_session_id: string;
  chapter_id: string;
  kind: AnnotationKind;
  selected_text: string;
  before_ctx: string;
  after_ctx: string;
  comment_body: string | null;
  created_at: string;
}

export interface ReaderChapterPayload {
  id: string;
  title: string | null;
  status: 'draft' | 'published';
  reading_rank: string;
  part_id: string;
  text: string;
}

export type ReaderTheme = 'dark' | 'light';

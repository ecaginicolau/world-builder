-- Slice (post-v1) — Public Reader + reader annotations
--
-- Adds 3 tables to support sharing a book with external readers via a
-- token-based public link, and to collect inline feedback (👍 / 👎 /
-- comment) on text selections.
--
-- Architecture choice: NO public-anon RLS. All reader-side access goes
-- through the `public-reader` Edge Function in service-role, which
-- validates the token + active flag + expiry on every call. The RLS
-- policies below are owner-scoped only, for the authoring app (anon key).
--
-- Tables:
--   - share_links: a token-protected pointer to a book. Created/managed
--     by the author from the app. Includes `include_drafts` to optionally
--     expose unpublished chapters.
--   - reader_sessions: identifies a reader on a given link via a
--     localStorage-only `reader_local_id` (uuidv4). Spoofable but fine
--     for the use case (beta readers, friends).
--   - reader_annotations: a single feedback unit attached to a text
--     selection in a chapter. `kind` ∈ {up, down, comment}. The selection
--     is anchored by `selected_text` + before/after context windows
--     (~30 chars each), so anchoring survives small edits. PM positions
--     intentionally not used.
--
-- Migration is idempotent: safe to re-apply.

-- ─── share_links ──────────────────────────────────────────────────────────

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  token text not null unique,
  label text,
  active boolean not null default true,
  allow_comments boolean not null default true,
  include_drafts boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists share_links_owner_created_idx
  on public.share_links (owner_id, created_at desc);

create index if not exists share_links_book_idx
  on public.share_links (book_id);

-- ─── reader_sessions ──────────────────────────────────────────────────────

create table if not exists public.reader_sessions (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  reader_local_id text not null,
  name text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (share_link_id, reader_local_id)
);

create index if not exists reader_sessions_link_seen_idx
  on public.reader_sessions (share_link_id, last_seen_at desc);

-- ─── reader_annotations ───────────────────────────────────────────────────

create table if not exists public.reader_annotations (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  reader_session_id uuid not null references public.reader_sessions(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  kind text not null check (kind in ('up','down','comment')),
  selected_text text not null,
  before_ctx text not null default '',
  after_ctx text not null default '',
  comment_body text,
  created_at timestamptz not null default now()
);

create index if not exists reader_annotations_chapter_created_idx
  on public.reader_annotations (chapter_id, created_at desc);

create index if not exists reader_annotations_link_created_idx
  on public.reader_annotations (share_link_id, created_at desc);

create index if not exists reader_annotations_session_idx
  on public.reader_annotations (reader_session_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────

alter table public.share_links enable row level security;
alter table public.reader_sessions enable row level security;
alter table public.reader_annotations enable row level security;

-- share_links: owner full access (anon-key from authoring app)
drop policy if exists share_links_owner on public.share_links;
create policy share_links_owner on public.share_links
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- reader_sessions: owner read via join (no inserts/updates from anon —
-- those happen via the edge function in service-role).
drop policy if exists reader_sessions_owner_read on public.reader_sessions;
create policy reader_sessions_owner_read on public.reader_sessions
  for select
  using (
    exists (
      select 1 from public.share_links sl
      where sl.id = share_link_id and sl.owner_id = auth.uid()
    )
  );

-- reader_annotations: owner read + delete (delete = moderation côté auteur).
-- Inserts come from the edge function only.
drop policy if exists reader_annotations_owner_read on public.reader_annotations;
create policy reader_annotations_owner_read on public.reader_annotations
  for select
  using (
    exists (
      select 1 from public.share_links sl
      where sl.id = share_link_id and sl.owner_id = auth.uid()
    )
  );

drop policy if exists reader_annotations_owner_delete on public.reader_annotations;
create policy reader_annotations_owner_delete on public.reader_annotations
  for delete
  using (
    exists (
      select 1 from public.share_links sl
      where sl.id = share_link_id and sl.owner_id = auth.uid()
    )
  );

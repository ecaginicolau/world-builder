-- Slice 4: books + parts + chapters + chapter_participants + RLS
-- Apply via Supabase SQL editor.
--
-- Depends on V001 (worlds, set_updated_at), V002 (notes), V003 (entities).

-- ─── books ─────────────────────────────────────────────────────────────────

create table if not exists public.books (
  id          uuid        primary key default gen_random_uuid(),
  world_id    uuid        not null references public.worlds(id) on delete cascade,
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  rank        text        not null,
  title       text        not null check (length(title) between 1 and 200),
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (world_id, rank)
);

create index if not exists books_world_idx on public.books (world_id, rank);

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

alter table public.books enable row level security;

drop policy if exists "books: owner can select" on public.books;
create policy "books: owner can select" on public.books for select using (owner_id = auth.uid());
drop policy if exists "books: owner can insert" on public.books;
create policy "books: owner can insert" on public.books for insert with check (owner_id = auth.uid());
drop policy if exists "books: owner can update" on public.books;
create policy "books: owner can update" on public.books for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "books: owner can delete" on public.books;
create policy "books: owner can delete" on public.books for delete using (owner_id = auth.uid());

-- ─── parts ─────────────────────────────────────────────────────────────────

create table if not exists public.parts (
  id          uuid        primary key default gen_random_uuid(),
  book_id     uuid        not null references public.books(id) on delete cascade,
  world_id    uuid        not null references public.worlds(id) on delete cascade,
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  rank        text        not null,
  title       text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (book_id, rank)
);

create index if not exists parts_book_idx  on public.parts (book_id, rank);
create index if not exists parts_world_idx on public.parts (world_id);

drop trigger if exists parts_set_updated_at on public.parts;
create trigger parts_set_updated_at
  before update on public.parts
  for each row execute function public.set_updated_at();

alter table public.parts enable row level security;

drop policy if exists "parts: owner can select" on public.parts;
create policy "parts: owner can select" on public.parts for select using (owner_id = auth.uid());
drop policy if exists "parts: owner can insert" on public.parts;
create policy "parts: owner can insert" on public.parts for insert with check (owner_id = auth.uid());
drop policy if exists "parts: owner can update" on public.parts;
create policy "parts: owner can update" on public.parts for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "parts: owner can delete" on public.parts;
create policy "parts: owner can delete" on public.parts for delete using (owner_id = auth.uid());

-- ─── chapters ──────────────────────────────────────────────────────────────

create table if not exists public.chapters (
  id                   uuid        primary key default gen_random_uuid(),
  part_id              uuid        not null references public.parts(id) on delete cascade,
  world_id             uuid        not null references public.worlds(id) on delete cascade,
  owner_id             uuid        not null references auth.users(id) on delete cascade,
  reading_rank         text        not null,
  chronological_rank   text        not null,
  title                text,
  draft                text        not null default '',
  content              text        not null default '',
  summary_s            text,
  summary_m            text,
  summary_l            text,
  status               text        not null default 'draft' check (status in ('draft', 'published')),
  published_at         timestamptz,
  source_note_id       uuid        references public.notes(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (part_id, reading_rank)
);

create index if not exists chapters_part_idx          on public.chapters (part_id, reading_rank);
create index if not exists chapters_world_chrono_idx  on public.chapters (world_id, chronological_rank);
create index if not exists chapters_status_idx        on public.chapters (world_id, status);

drop trigger if exists chapters_set_updated_at on public.chapters;
create trigger chapters_set_updated_at
  before update on public.chapters
  for each row execute function public.set_updated_at();

alter table public.chapters enable row level security;

drop policy if exists "chapters: owner can select" on public.chapters;
create policy "chapters: owner can select" on public.chapters for select using (owner_id = auth.uid());
drop policy if exists "chapters: owner can insert" on public.chapters;
create policy "chapters: owner can insert" on public.chapters for insert with check (owner_id = auth.uid());
drop policy if exists "chapters: owner can update" on public.chapters;
create policy "chapters: owner can update" on public.chapters for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "chapters: owner can delete" on public.chapters;
create policy "chapters: owner can delete" on public.chapters for delete using (owner_id = auth.uid());

-- ─── chapter_participants (pivot) ──────────────────────────────────────────

create table if not exists public.chapter_participants (
  chapter_id  uuid        not null references public.chapters(id) on delete cascade,
  entity_id   uuid        not null references public.entities(id) on delete cascade,
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (chapter_id, entity_id)
);

create index if not exists chapter_participants_entity_idx on public.chapter_participants (entity_id);

alter table public.chapter_participants enable row level security;

drop policy if exists "chapter_participants: owner can select" on public.chapter_participants;
create policy "chapter_participants: owner can select" on public.chapter_participants for select using (owner_id = auth.uid());
drop policy if exists "chapter_participants: owner can insert" on public.chapter_participants;
create policy "chapter_participants: owner can insert" on public.chapter_participants for insert with check (owner_id = auth.uid());
drop policy if exists "chapter_participants: owner can delete" on public.chapter_participants;
create policy "chapter_participants: owner can delete" on public.chapter_participants for delete using (owner_id = auth.uid());

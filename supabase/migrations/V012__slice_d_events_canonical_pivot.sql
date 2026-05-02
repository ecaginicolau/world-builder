-- Slice (d) — Events as canonical source + chapter↔event M:M.
-- Apply via Supabase SQL editor (cloud). Idempotent — safe to re-run.
--
-- Depends on:
--   V001 (worlds, set_updated_at), V002 (notes), V003 (entities),
--   V005 (chapters, chapter_participants), V007 (events),
--   V008 (entity_versions). V010 stays compatible (search_text on existing tables).
--   V011 stays unapplied (obsolete) — this migration drops the column it would
--   have added if you applied it by accident (IF EXISTS).
--
-- Pre-MVP cleanup: data in entity_versions is test data and gets reset.
-- Existing chapter.chronological_rank values are dropped — chapter chrono is
-- now derived from linked events.

begin;

-- ─── 1. events: rich description (Tiptap mini) ──────────────────────────────
alter table public.events
  add column if not exists description_html text;

-- ─── 2. chapters: drop chronological_rank, add last_analyzed_at ────────────
-- chapter chrono position is now derived from its linked events (chapter_events).
alter table public.chapters
  drop column if exists chronological_rank;

alter table public.chapters
  add column if not exists last_analyzed_at timestamptz;

-- ─── 3. entity_versions: pivot to events as the only canonical source ──────
-- Reset test data first so the unique partial index below can be created
-- without conflicts on legacy versions that have NULL source_event_id.
truncate public.entity_versions;

alter table public.entity_versions
  drop column if exists source_chapter_id;

alter table public.entity_versions
  drop column if exists source_chapter_version_id;

alter table public.entity_versions
  add column if not exists source_event_id uuid
    references public.events(id) on delete set null;

create index if not exists entity_versions_source_event_idx
  on public.entity_versions (source_event_id)
  where source_event_id is not null;

-- Exactly one "initial" version per entity (the v0 with no source event).
-- Every other entity_version MUST have source_event_id set (enforced by app).
create unique index if not exists entity_versions_single_init
  on public.entity_versions (entity_id)
  where source_event_id is null;

-- ─── 4. chapter_events (M:M pivot, narrative_rank = order within chapter) ──
create table if not exists public.chapter_events (
  chapter_id     uuid        not null references public.chapters(id) on delete cascade,
  event_id       uuid        not null references public.events(id)   on delete cascade,
  world_id       uuid        not null references public.worlds(id)   on delete cascade,
  owner_id       uuid        not null references auth.users(id)      on delete cascade,
  narrative_rank text        not null,
  created_at     timestamptz not null default now(),
  primary key (chapter_id, event_id)
);

create index if not exists chapter_events_chapter_idx
  on public.chapter_events (chapter_id, narrative_rank);

create index if not exists chapter_events_event_idx
  on public.chapter_events (event_id);

create index if not exists chapter_events_world_idx
  on public.chapter_events (world_id);

alter table public.chapter_events enable row level security;

drop policy if exists "chapter_events: owner can select" on public.chapter_events;
create policy "chapter_events: owner can select" on public.chapter_events
  for select using (owner_id = auth.uid());

drop policy if exists "chapter_events: owner can insert" on public.chapter_events;
create policy "chapter_events: owner can insert" on public.chapter_events
  for insert with check (owner_id = auth.uid());

drop policy if exists "chapter_events: owner can update" on public.chapter_events;
create policy "chapter_events: owner can update" on public.chapter_events
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "chapter_events: owner can delete" on public.chapter_events;
create policy "chapter_events: owner can delete" on public.chapter_events
  for delete using (owner_id = auth.uid());

-- ─── 4b. chat_threads — allow parent_kind='event' (canon-side chat) ───────
-- The original CHECK is unnamed so PG auto-names it. We probe by inspecting
-- the constraint definition rather than relying on the conventional name.
do $$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.chat_threads'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%parent_kind%'
   limit 1;
  if cname is not null then
    execute format('alter table public.chat_threads drop constraint %I', cname);
  end if;
end$$;

alter table public.chat_threads
  add constraint chat_threads_parent_kind_check
  check (parent_kind in ('note', 'chapter', 'entity', 'event'));

-- ─── 5. event_participants (calque chapter_participants) ───────────────────
create table if not exists public.event_participants (
  event_id        uuid        not null references public.events(id)   on delete cascade,
  entity_id       uuid        not null references public.entities(id) on delete cascade,
  world_id        uuid        not null references public.worlds(id)   on delete cascade,
  owner_id        uuid        not null references auth.users(id)      on delete cascade,
  pinned_manually boolean     not null default false,
  created_at      timestamptz not null default now(),
  primary key (event_id, entity_id)
);

create index if not exists event_participants_entity_idx
  on public.event_participants (entity_id);

create index if not exists event_participants_world_idx
  on public.event_participants (world_id);

alter table public.event_participants enable row level security;

drop policy if exists "event_participants: owner can select" on public.event_participants;
create policy "event_participants: owner can select" on public.event_participants
  for select using (owner_id = auth.uid());

drop policy if exists "event_participants: owner can insert" on public.event_participants;
create policy "event_participants: owner can insert" on public.event_participants
  for insert with check (owner_id = auth.uid());

drop policy if exists "event_participants: owner can update" on public.event_participants;
create policy "event_participants: owner can update" on public.event_participants
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "event_participants: owner can delete" on public.event_participants;
create policy "event_participants: owner can delete" on public.event_participants
  for delete using (owner_id = auth.uid());

commit;

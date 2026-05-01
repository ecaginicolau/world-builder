-- Slice 3: note_promotions (audit log of "note → entity/chapter/event" crystallizations)
-- Apply via Supabase SQL editor.
--
-- Depends on V001 (worlds), V002 (notes, chat_threads), V003 (entities).

create table if not exists public.note_promotions (
  id              uuid        primary key default gen_random_uuid(),
  note_id         uuid        not null references public.notes(id) on delete cascade,
  owner_id        uuid        not null references auth.users(id) on delete cascade,
  target_kind     text        not null check (target_kind in ('entity', 'entity_version', 'chapter', 'event', 'note_split')),
  target_id       uuid        not null,
  source_excerpt  text,
  thread_id       uuid        references public.chat_threads(id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid        not null references auth.users(id) on delete cascade
);

create index if not exists note_promotions_note_idx
  on public.note_promotions (note_id, created_at desc);
create index if not exists note_promotions_target_idx
  on public.note_promotions (target_kind, target_id);

alter table public.note_promotions enable row level security;

drop policy if exists "note_promotions: owner can select" on public.note_promotions;
create policy "note_promotions: owner can select"
  on public.note_promotions for select
  using (owner_id = auth.uid());

drop policy if exists "note_promotions: owner can insert" on public.note_promotions;
create policy "note_promotions: owner can insert"
  on public.note_promotions for insert
  with check (owner_id = auth.uid());

-- update/delete intentionally not exposed; promotions are an audit log.

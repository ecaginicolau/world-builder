-- Slice 6: entity_versions (append-only) + state-at-rank index
-- Apply via Supabase SQL editor (cloud).
--
-- Depends on V001 (worlds, set_updated_at), V002 (notes), V003 (entities), V005 (chapters).

create table if not exists public.entity_versions (
  id                 uuid        primary key default gen_random_uuid(),
  entity_id          uuid        not null references public.entities(id) on delete cascade,
  world_id           uuid        not null references public.worlds(id) on delete cascade,
  owner_id           uuid        not null references auth.users(id) on delete cascade,
  valid_from_rank    text        not null,
  snapshot           jsonb       not null default '{}'::jsonb,
  source_note_id     uuid        references public.notes(id) on delete set null,
  source_chapter_id  uuid        references public.chapters(id) on delete set null,
  note_excerpt       text,
  created_at         timestamptz not null default now()
);

create index if not exists entity_versions_resolution_idx
  on public.entity_versions (entity_id, valid_from_rank desc);

create index if not exists entity_versions_world_idx
  on public.entity_versions (world_id);

-- ─── Append-only enforcement ──────────────────────────────────────────────
create or replace function public.prevent_modification()
returns trigger as $$
begin
  raise exception 'entity_versions is append-only';
end;
$$ language plpgsql;

drop trigger if exists entity_versions_no_update on public.entity_versions;
create trigger entity_versions_no_update
  before update on public.entity_versions
  for each row execute function public.prevent_modification();

-- DELETE allowed only via cascade from entities (no policy = no direct delete from clients).

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table public.entity_versions enable row level security;

drop policy if exists "entity_versions: owner can select" on public.entity_versions;
create policy "entity_versions: owner can select"
  on public.entity_versions for select
  using (owner_id = auth.uid());

drop policy if exists "entity_versions: owner can insert" on public.entity_versions;
create policy "entity_versions: owner can insert"
  on public.entity_versions for insert
  with check (owner_id = auth.uid());

-- update/delete intentionally not exposed (trigger blocks update; cascade-only for delete).

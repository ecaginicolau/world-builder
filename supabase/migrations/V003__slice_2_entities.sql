-- Slice 2: entity_types + entities + note_entities + RLS
-- Apply via Supabase SQL editor (cloud) for now.
--
-- Depends on V001 (worlds, set_updated_at) and V002 (notes).

-- ─── entity_types ──────────────────────────────────────────────────────────

create table if not exists public.entity_types (
  id          uuid        primary key default gen_random_uuid(),
  world_id    uuid        not null references public.worlds(id) on delete cascade,
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null check (length(name) between 1 and 80),
  icon        text,
  fields      jsonb       not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (world_id, name)
);

create index if not exists entity_types_world_idx on public.entity_types (world_id);

drop trigger if exists entity_types_set_updated_at on public.entity_types;
create trigger entity_types_set_updated_at
  before update on public.entity_types
  for each row
  execute function public.set_updated_at();

alter table public.entity_types enable row level security;

drop policy if exists "entity_types: owner can select" on public.entity_types;
create policy "entity_types: owner can select"
  on public.entity_types for select
  using (owner_id = auth.uid());

drop policy if exists "entity_types: owner can insert" on public.entity_types;
create policy "entity_types: owner can insert"
  on public.entity_types for insert
  with check (owner_id = auth.uid());

drop policy if exists "entity_types: owner can update" on public.entity_types;
create policy "entity_types: owner can update"
  on public.entity_types for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "entity_types: owner can delete" on public.entity_types;
create policy "entity_types: owner can delete"
  on public.entity_types for delete
  using (owner_id = auth.uid());

-- ─── entities ──────────────────────────────────────────────────────────────

create table if not exists public.entities (
  id              uuid        primary key default gen_random_uuid(),
  world_id        uuid        not null references public.worlds(id) on delete cascade,
  owner_id        uuid        not null references auth.users(id) on delete cascade,
  entity_type_id  uuid        not null references public.entity_types(id) on delete restrict,
  name            text        not null check (length(name) between 1 and 200),
  aliases         text[]      not null default '{}',
  tags            text[]      not null default '{}',
  source_note_id  uuid        references public.notes(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists entities_world_name_idx on public.entities (world_id, name);
create index if not exists entities_aliases_gin    on public.entities using gin (aliases);
create index if not exists entities_tags_gin       on public.entities using gin (tags);

drop trigger if exists entities_set_updated_at on public.entities;
create trigger entities_set_updated_at
  before update on public.entities
  for each row
  execute function public.set_updated_at();

alter table public.entities enable row level security;

drop policy if exists "entities: owner can select" on public.entities;
create policy "entities: owner can select"
  on public.entities for select
  using (owner_id = auth.uid());

drop policy if exists "entities: owner can insert" on public.entities;
create policy "entities: owner can insert"
  on public.entities for insert
  with check (owner_id = auth.uid());

drop policy if exists "entities: owner can update" on public.entities;
create policy "entities: owner can update"
  on public.entities for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "entities: owner can delete" on public.entities;
create policy "entities: owner can delete"
  on public.entities for delete
  using (owner_id = auth.uid());

-- ─── note_entities (pivot) ─────────────────────────────────────────────────

create table if not exists public.note_entities (
  note_id           uuid        not null references public.notes(id) on delete cascade,
  entity_id         uuid        not null references public.entities(id) on delete cascade,
  owner_id          uuid        not null references auth.users(id) on delete cascade,
  pinned_manually   boolean     not null default true,
  created_at        timestamptz not null default now(),
  primary key (note_id, entity_id)
);

create index if not exists note_entities_entity_idx on public.note_entities (entity_id);

alter table public.note_entities enable row level security;

drop policy if exists "note_entities: owner can select" on public.note_entities;
create policy "note_entities: owner can select"
  on public.note_entities for select
  using (owner_id = auth.uid());

drop policy if exists "note_entities: owner can insert" on public.note_entities;
create policy "note_entities: owner can insert"
  on public.note_entities for insert
  with check (owner_id = auth.uid());

drop policy if exists "note_entities: owner can delete" on public.note_entities;
create policy "note_entities: owner can delete"
  on public.note_entities for delete
  using (owner_id = auth.uid());

-- update intentionally not exposed; row is just a (note, entity) pair.

-- Slice (post-v1) — Illustrations attached to entities
--
-- Adds a single table `entity_illustrations` and a public Storage bucket
-- `illustrations` to store image files.
--
-- Design choices:
--   - Illustrations are strictly attached to one entity (entity_id NOT NULL).
--     A future v2 may relax this to allow free-floating illustrations.
--   - The reference from a chapter to an illustration lives INSIDE the
--     chapter Tiptap content as a custom node serialized to
--     `<figure data-illustration-id="...">`. No pivot table chapter ↔
--     illustration: simpler, and lets the editor own the placement.
--   - Storage bucket is PUBLIC for read. Paths are `{world_id}/{entity_id}/{uuid}.{ext}`,
--     UUIDs make objects unguessable. Content is non-sensitive (book illustrations
--     intended to be visible by readers via public reader / PDF).
--   - No client-side resize for v1 — keep full resolution for print quality.
--     A future v2 may store a thumbnail variant alongside.
--
-- Migration is idempotent: safe to re-apply.

-- ─── Table entity_illustrations ───────────────────────────────────────────

create table if not exists public.entity_illustrations (
  id            uuid        primary key default gen_random_uuid(),
  entity_id     uuid        not null references public.entities(id) on delete cascade,
  world_id      uuid        not null references public.worlds(id) on delete cascade,
  owner_id      uuid        not null references auth.users(id) on delete cascade,
  storage_path  text        not null unique,
  caption       text,
  alt_text      text,
  mime_type     text        not null,
  byte_size     integer,
  width         integer,
  height        integer,
  display_order integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists entity_illustrations_entity_idx
  on public.entity_illustrations (entity_id, display_order);

create index if not exists entity_illustrations_world_idx
  on public.entity_illustrations (world_id);

-- updated_at trigger (function set_updated_at exists from earlier migrations)
drop trigger if exists entity_illustrations_set_updated_at on public.entity_illustrations;
create trigger entity_illustrations_set_updated_at
  before update on public.entity_illustrations
  for each row execute function public.set_updated_at();

-- ─── RLS on entity_illustrations ──────────────────────────────────────────

alter table public.entity_illustrations enable row level security;

drop policy if exists "owner full access on entity_illustrations"
  on public.entity_illustrations;

create policy "owner full access on entity_illustrations"
  on public.entity_illustrations
  for all
  using      (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ─── Storage bucket `illustrations` ───────────────────────────────────────
-- Public bucket: readable by anyone (incl. public reader, PDF, anon).
-- Writes restricted by RLS on storage.objects below.

insert into storage.buckets (id, name, public)
values ('illustrations', 'illustrations', true)
on conflict (id) do update set public = excluded.public;

-- ─── RLS on storage.objects for the `illustrations` bucket ────────────────
-- Path convention: {world_id}/{entity_id}/{uuid}.{ext}
-- (storage.foldername(name))[1] returns the first path segment as text.
--
-- Read: bucket is public, no policy needed (Supabase serves public buckets
-- without RLS check on SELECT for public reads).
-- Write/Update/Delete: only the owner of the world referenced in the path.

drop policy if exists "owner can upload illustrations" on storage.objects;
create policy "owner can upload illustrations"
  on storage.objects
  for insert
  with check (
    bucket_id = 'illustrations'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.worlds where owner_id = auth.uid()
    )
  );

drop policy if exists "owner can update illustrations" on storage.objects;
create policy "owner can update illustrations"
  on storage.objects
  for update
  using (
    bucket_id = 'illustrations'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.worlds where owner_id = auth.uid()
    )
  );

drop policy if exists "owner can delete illustrations" on storage.objects;
create policy "owner can delete illustrations"
  on storage.objects
  for delete
  using (
    bucket_id = 'illustrations'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.worlds where owner_id = auth.uid()
    )
  );

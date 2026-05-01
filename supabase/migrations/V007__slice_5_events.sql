-- Slice 5: events table for the world timeline
-- Apply via Supabase SQL editor.
--
-- Depends on V001 (worlds, set_updated_at), V002 (notes).

-- ─── events ────────────────────────────────────────────────────────────────

create table if not exists public.events (
  id                  uuid        primary key default gen_random_uuid(),
  world_id            uuid        not null references public.worlds(id) on delete cascade,
  owner_id            uuid        not null references auth.users(id) on delete cascade,
  chronological_rank  text        not null,
  title               text        not null check (length(title) between 1 and 200),
  description         text,
  tags                text[]      not null default '{}',
  source_note_id      uuid        references public.notes(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists events_world_chrono_idx on public.events (world_id, chronological_rank);
create index if not exists events_tags_gin         on public.events using gin (tags);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;

drop policy if exists "events: owner can select" on public.events;
create policy "events: owner can select" on public.events for select using (owner_id = auth.uid());
drop policy if exists "events: owner can insert" on public.events;
create policy "events: owner can insert" on public.events for insert with check (owner_id = auth.uid());
drop policy if exists "events: owner can update" on public.events;
create policy "events: owner can update" on public.events for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "events: owner can delete" on public.events;
create policy "events: owner can delete" on public.events for delete using (owner_id = auth.uid());

-- Slice 0: worlds + user_settings + RLS
-- Apply via Supabase SQL editor (cloud) for now. Once the CLI is set up,
-- migrations will be applied via `supabase db push`.

-- ─── extensions ────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── shared trigger: updated_at ────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── worlds ────────────────────────────────────────────────────────────────

create table if not exists public.worlds (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null check (length(name) between 1 and 200),
  description text,
  world_memory text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists worlds_owner_idx on public.worlds (owner_id, created_at desc);

drop trigger if exists worlds_set_updated_at on public.worlds;
create trigger worlds_set_updated_at
  before update on public.worlds
  for each row
  execute function public.set_updated_at();

alter table public.worlds enable row level security;

drop policy if exists "worlds: owner can select" on public.worlds;
create policy "worlds: owner can select"
  on public.worlds for select
  using (owner_id = auth.uid());

drop policy if exists "worlds: owner can insert" on public.worlds;
create policy "worlds: owner can insert"
  on public.worlds for insert
  with check (owner_id = auth.uid());

drop policy if exists "worlds: owner can update" on public.worlds;
create policy "worlds: owner can update"
  on public.worlds for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "worlds: owner can delete" on public.worlds;
create policy "worlds: owner can delete"
  on public.worlds for delete
  using (owner_id = auth.uid());

-- ─── user_settings ─────────────────────────────────────────────────────────

create table if not exists public.user_settings (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  preferred_llm_model text,
  ui_prefs   jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row
  execute function public.set_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists "user_settings: owner can select" on public.user_settings;
create policy "user_settings: owner can select"
  on public.user_settings for select
  using (user_id = auth.uid());

drop policy if exists "user_settings: owner can insert" on public.user_settings;
create policy "user_settings: owner can insert"
  on public.user_settings for insert
  with check (user_id = auth.uid());

drop policy if exists "user_settings: owner can update" on public.user_settings;
create policy "user_settings: owner can update"
  on public.user_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

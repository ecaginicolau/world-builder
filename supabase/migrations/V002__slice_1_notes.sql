-- Slice 1: notes + chat_threads + chat_messages + runs + RLS
-- Apply via Supabase SQL editor (cloud) for now. Once the CLI is set up,
-- migrations will be applied via `supabase db push`.
--
-- Depends on V001 (worlds, user_settings, public.set_updated_at()).

-- ─── notes ─────────────────────────────────────────────────────────────────

create table if not exists public.notes (
  id          uuid        primary key default gen_random_uuid(),
  world_id    uuid        not null references public.worlds(id) on delete cascade,
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  title       text,
  content     text        not null default '',
  status      text        not null default 'open' check (status in ('open', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notes_world_status_idx
  on public.notes (world_id, status, updated_at desc);

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row
  execute function public.set_updated_at();

alter table public.notes enable row level security;

drop policy if exists "notes: owner can select" on public.notes;
create policy "notes: owner can select"
  on public.notes for select
  using (owner_id = auth.uid());

drop policy if exists "notes: owner can insert" on public.notes;
create policy "notes: owner can insert"
  on public.notes for insert
  with check (owner_id = auth.uid());

drop policy if exists "notes: owner can update" on public.notes;
create policy "notes: owner can update"
  on public.notes for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "notes: owner can delete" on public.notes;
create policy "notes: owner can delete"
  on public.notes for delete
  using (owner_id = auth.uid());

-- ─── chat_threads ──────────────────────────────────────────────────────────

create table if not exists public.chat_threads (
  id           uuid        primary key default gen_random_uuid(),
  world_id     uuid        not null references public.worlds(id) on delete cascade,
  owner_id     uuid        not null references auth.users(id) on delete cascade,
  parent_kind  text        not null check (parent_kind in ('note', 'chapter', 'entity')),
  parent_id    uuid        not null,
  title        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists chat_threads_parent_idx
  on public.chat_threads (parent_kind, parent_id, updated_at desc);
create index if not exists chat_threads_world_idx
  on public.chat_threads (world_id);

drop trigger if exists chat_threads_set_updated_at on public.chat_threads;
create trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row
  execute function public.set_updated_at();

alter table public.chat_threads enable row level security;

drop policy if exists "chat_threads: owner can select" on public.chat_threads;
create policy "chat_threads: owner can select"
  on public.chat_threads for select
  using (owner_id = auth.uid());

drop policy if exists "chat_threads: owner can insert" on public.chat_threads;
create policy "chat_threads: owner can insert"
  on public.chat_threads for insert
  with check (owner_id = auth.uid());

drop policy if exists "chat_threads: owner can update" on public.chat_threads;
create policy "chat_threads: owner can update"
  on public.chat_threads for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "chat_threads: owner can delete" on public.chat_threads;
create policy "chat_threads: owner can delete"
  on public.chat_threads for delete
  using (owner_id = auth.uid());

-- ─── chat_messages ─────────────────────────────────────────────────────────

create table if not exists public.chat_messages (
  id           uuid        primary key default gen_random_uuid(),
  thread_id    uuid        not null references public.chat_threads(id) on delete cascade,
  owner_id     uuid        not null references auth.users(id) on delete cascade,
  role         text        not null check (role in ('system', 'user', 'assistant')),
  content      text        not null,
  model        text,
  provider     text,
  tokens_used  jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages: owner can select" on public.chat_messages;
create policy "chat_messages: owner can select"
  on public.chat_messages for select
  using (owner_id = auth.uid());

drop policy if exists "chat_messages: owner can insert" on public.chat_messages;
create policy "chat_messages: owner can insert"
  on public.chat_messages for insert
  with check (owner_id = auth.uid());

-- update/delete intentionally not exposed for chat_messages in slice 1.

-- ─── runs (audit log polymorphique) ────────────────────────────────────────

create table if not exists public.runs (
  id              uuid        primary key default gen_random_uuid(),
  world_id        uuid        not null references public.worlds(id) on delete cascade,
  owner_id        uuid        not null references auth.users(id) on delete cascade,
  kind            text        not null check (kind in ('chat', 'auto_extract', 'upscale', 'propose_updates', 'summarize')),
  parent_kind     text,
  parent_id       uuid,
  session_rank    text,
  model           text        not null,
  provider        text        not null,
  prompt_hash     text,
  usage           jsonb,
  duration_ms     integer,
  status          text        not null default 'success' check (status in ('success', 'error', 'cancelled')),
  error_message   text,
  input_summary   jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists runs_world_idx  on public.runs (world_id, created_at desc);
create index if not exists runs_parent_idx on public.runs (parent_kind, parent_id);
create index if not exists runs_kind_idx   on public.runs (world_id, kind, created_at desc);

alter table public.runs enable row level security;

drop policy if exists "runs: owner can select" on public.runs;
create policy "runs: owner can select"
  on public.runs for select
  using (owner_id = auth.uid());

drop policy if exists "runs: owner can insert" on public.runs;
create policy "runs: owner can insert"
  on public.runs for insert
  with check (owner_id = auth.uid());

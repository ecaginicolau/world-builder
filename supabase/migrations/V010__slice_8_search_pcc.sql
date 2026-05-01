-- Slice 8: full-text search columns/indexes + PCC config on worlds.
-- Apply via Supabase SQL editor (cloud). Idempotent — safe to re-run.
--
-- Depends on:
--   V001 (worlds), V002 (notes), V003 (entities), V005 (chapters),
--   V009 (chapter_versions, applied directly in dashboard).

-- ─── PCC: previous-chapter context per world ───────────────────────────────

alter table public.worlds
  add column if not exists previous_chapter_context jsonb
    not null default '["raw","L","M","S","S","S"]'::jsonb;

create or replace function public.validate_pcc()
returns trigger as $$
declare
  el text;
begin
  if jsonb_typeof(new.previous_chapter_context) <> 'array' then
    raise exception 'previous_chapter_context must be a JSON array';
  end if;
  for el in select jsonb_array_elements_text(new.previous_chapter_context) loop
    if el not in ('raw', 'L', 'M', 'S') then
      raise exception 'previous_chapter_context elements must be one of raw|L|M|S, got %', el;
    end if;
  end loop;
  return new;
end;
$$ language plpgsql;

drop trigger if exists worlds_validate_pcc on public.worlds;
create trigger worlds_validate_pcc
  before insert or update of previous_chapter_context on public.worlds
  for each row execute function public.validate_pcc();

-- ─── Summarize tier in user_settings ───────────────────────────────────────

alter table public.user_settings
  add column if not exists summarize_tier text
    check (summarize_tier in ('cheapest', 'medium', 'best'));

-- ─── FTS via trigger-maintained `search_text` columns ─────────────────────
--
-- Why this design: GENERATED ALWAYS AS (...) STORED requires the expression
-- to be IMMUTABLE — and Postgres' immutability check is strict (rejects
-- `to_tsvector('simple', x)` because the cast text→regconfig isn't pinned at
-- planning time, and even rejects some text concat / array_to_string forms
-- depending on locale-aware behavior).
--
-- A plain `text` column maintained by a BEFORE INSERT/UPDATE trigger sidesteps
-- the entire immutability machinery: the trigger can use any function, and the
-- GIN index applies `to_tsvector('simple', …)` as an index expression
-- (expression indexes are more permissive than generated-column expressions).
-- PostgREST's `.textSearch('search_text', q, { config: 'simple' })` produces
-- a query whose to_tsvector('simple', search_text) matches the index expression,
-- so the planner uses the GIN index.

-- Backfill helper: drop any leftover columns/indexes from earlier (failed)
-- attempts. Safe no-ops if they don't exist.
drop index if exists public.notes_search_tsv_idx;
drop index if exists public.chapter_versions_search_tsv_idx;
drop index if exists public.entities_search_tsv_idx;

alter table public.notes              drop column if exists search_tsv;
alter table public.chapter_versions   drop column if exists search_tsv;
alter table public.entities           drop column if exists search_tsv;

-- notes ────────────────────────────────────────────────────────────────────
alter table public.notes
  add column if not exists search_text text;

create or replace function public.notes_update_search_text()
returns trigger as $$
begin
  new.search_text := coalesce(new.title, '') || ' ' || coalesce(new.content, '');
  return new;
end;
$$ language plpgsql;

drop trigger if exists notes_search_text_trg on public.notes;
create trigger notes_search_text_trg
  before insert or update of title, content on public.notes
  for each row execute function public.notes_update_search_text();

update public.notes
  set search_text = coalesce(title, '') || ' ' || coalesce(content, '')
  where search_text is null;

create index if not exists notes_search_text_fts_idx
  on public.notes using gin (to_tsvector('simple', coalesce(search_text, '')));

-- chapter_versions ─────────────────────────────────────────────────────────
alter table public.chapter_versions
  add column if not exists search_text text;

create or replace function public.chapter_versions_update_search_text()
returns trigger as $$
begin
  new.search_text := coalesce(new.text, '');
  return new;
end;
$$ language plpgsql;

drop trigger if exists chapter_versions_search_text_trg on public.chapter_versions;
create trigger chapter_versions_search_text_trg
  before insert or update of text on public.chapter_versions
  for each row execute function public.chapter_versions_update_search_text();

update public.chapter_versions
  set search_text = coalesce(text, '')
  where search_text is null;

create index if not exists chapter_versions_search_text_fts_idx
  on public.chapter_versions using gin (to_tsvector('simple', coalesce(search_text, '')));

-- entities ─────────────────────────────────────────────────────────────────
alter table public.entities
  add column if not exists search_text text;

create or replace function public.entities_update_search_text()
returns trigger as $$
begin
  new.search_text := coalesce(new.name, '')
                     || ' '
                     || coalesce(array_to_string(new.aliases, ' '), '');
  return new;
end;
$$ language plpgsql;

drop trigger if exists entities_search_text_trg on public.entities;
create trigger entities_search_text_trg
  before insert or update of name, aliases on public.entities
  for each row execute function public.entities_update_search_text();

update public.entities
  set search_text = coalesce(name, '')
                    || ' '
                    || coalesce(array_to_string(aliases, ' '), '')
  where search_text is null;

create index if not exists entities_search_text_fts_idx
  on public.entities using gin (to_tsvector('simple', coalesce(search_text, '')));

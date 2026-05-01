-- Slice 3.x / 3.y polish: per-world custom prompt + entity type color.
-- Apply via Supabase SQL editor.
--
-- Depends on V001 (worlds), V003 (entity_types).
-- Both columns are nullable; existing rows are unaffected.

alter table public.worlds
  add column if not exists custom_prompt text;

alter table public.entity_types
  add column if not exists color text;

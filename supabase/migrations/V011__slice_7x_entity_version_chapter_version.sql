-- Slice 7+: link entity_versions to a specific chapter_version so we can
-- filter "stale" entity updates when a chapter gets re-tweaked (new
-- final_version_id). Idempotent — safe to re-run.
--
-- Apply via Supabase SQL editor (cloud).
--
-- Depends on:
--   V008 (entity_versions),
--   V009 (chapter_versions, applied directly in dashboard).

alter table public.entity_versions
  add column if not exists source_chapter_version_id uuid
    references public.chapter_versions(id) on delete set null;

-- Resolution filter (entity_id, source_chapter_version_id) — used when joining
-- against chapters.final_version_id to drop superseded updates.
create index if not exists entity_versions_source_chapter_version_idx
  on public.entity_versions (source_chapter_version_id)
  where source_chapter_version_id is not null;

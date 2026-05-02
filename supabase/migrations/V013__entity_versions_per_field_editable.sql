-- Slice (d.x) — entity_versions are now per-field editable in place.
-- Apply via Supabase SQL editor (cloud). Idempotent — safe to re-run.
--
-- Depends on V008 (entity_versions table + prevent_modification trigger),
-- V012 (entity_versions_single_init unique partial + source_event_id column).
--
-- Why: with events as canon, each version stores ONLY the fields explicitly
-- changed at its anchor (delta storage). Resolving the snapshot at a rank
-- walks per-field backwards through versions. The user must be able to tweak
-- field values directly without producing a new version row, so we drop the
-- "append-only" trigger and add UPDATE/DELETE policies. We also enforce at
-- most one version per (entity, event) so edits upsert cleanly.

begin;

-- 1. Drop the append-only enforcement trigger. The function `prevent_modification`
--    is left in place (harmless, may be reused later by other tables).
drop trigger if exists entity_versions_no_update on public.entity_versions;

-- 2. Allow owner-scoped UPDATE and DELETE via RLS (V008 only granted SELECT/INSERT).
drop policy if exists "entity_versions: owner can update" on public.entity_versions;
create policy "entity_versions: owner can update"
  on public.entity_versions for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "entity_versions: owner can delete" on public.entity_versions;
create policy "entity_versions: owner can delete"
  on public.entity_versions for delete
  using (owner_id = auth.uid());

-- 3. At most one entity_version per (entity_id, source_event_id) when the version
--    is event-anchored. This makes "edit a field at anchor X" a clean upsert.
--    The init version (source_event_id IS NULL) is already constrained to 1 per
--    entity by entity_versions_single_init from V012.
create unique index if not exists entity_versions_per_event
  on public.entity_versions (entity_id, source_event_id)
  where source_event_id is not null;

commit;

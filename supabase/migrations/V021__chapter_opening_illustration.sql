-- V021 — Chapter opening illustration (frontispiece)
--
-- Optional FK to an entity_illustration that should be rendered as a
-- full-page plate at the start of the chapter, immediately before the
-- chapter title page. Convention: the plate sits on the verso (left) of a
-- 2-page opening spread, with the chapter title page facing it on the
-- recto (right). Parity is NOT enforced — the plate lands on whatever
-- parity the cumulative pagination produces; users wanting a strict
-- verso-recto spread can insert a manual page break at the end of the
-- previous chapter.
--
-- ON DELETE SET NULL: deleting the illustration silently clears the
-- reference rather than cascading the chapter (we don't want to lose a
-- chapter just because its frontispiece was removed).
--
-- Migration is idempotent: safe to re-apply.

alter table public.chapters
  add column if not exists opening_illustration_id uuid
    references public.entity_illustrations(id) on delete set null;

comment on column public.chapters.opening_illustration_id is
  'Optional frontispiece — a full-page illustration rendered immediately before the chapter content (PDF + WYSIWYG preview). NULL = no plate.';

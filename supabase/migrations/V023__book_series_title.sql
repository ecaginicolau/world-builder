-- V023 — Book series title
--
-- Optional line displayed above the book title (PDF cover page primarily).
-- Free text: multiple books in the same world that share a series simply
-- carry the same string. No dedicated `series` table — the simplest path
-- that meets the current need; migrate later if series gain their own
-- attributes (description, ordering, logo, …).
--
-- Idempotent: safe to re-apply.

alter table public.books
  add column if not exists series_title text;

comment on column public.books.series_title is
  'Optional series name shown above the book title on the PDF cover. Free text — sibling books in a series share the same string. NULL = none.';

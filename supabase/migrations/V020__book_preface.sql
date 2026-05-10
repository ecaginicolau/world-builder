-- V020 — Book preface
--
-- Optional "preface" chapter per book. Behaves like a regular chapter
-- (rich-text editor, versions, header/footer, illustrations, status) but:
--   - sits OUTSIDE the part hierarchy (book_id set, part_id null)
--   - does NOT count in chapter numbering
--   - always renders FIRST in PDF export, in-app reader, and public reader
--   - is not expected to carry events/entities (no schema change there;
--     the columns just stay empty for prefaces)
--
-- Schema choice: rather than a separate table, we relax `chapters.part_id`
-- to nullable and introduce two new columns:
--   - is_preface boolean
--   - book_id    uuid (FK books)
-- A check constraint enforces the two flavors (regular vs preface) and a
-- partial unique index enforces "one preface per book".
--
-- Idempotent: safe to re-apply.
--
-- Migration is non-destructive — existing chapters keep their part_id and
-- get is_preface=false, book_id=null.

alter table public.chapters
  add column if not exists is_preface boolean not null default false,
  add column if not exists book_id    uuid    references public.books(id) on delete cascade;

alter table public.chapters
  alter column part_id drop not null;

-- Drop any prior version of the constraint before re-adding (idempotent).
alter table public.chapters
  drop constraint if exists chapters_preface_or_part_chk;

alter table public.chapters
  add constraint chapters_preface_or_part_chk check (
    (is_preface = false and part_id is not null and book_id is null)
    or
    (is_preface = true  and part_id is null     and book_id is not null)
  );

create unique index if not exists chapters_one_preface_per_book
  on public.chapters (book_id) where is_preface = true;

create index if not exists chapters_book_id_idx
  on public.chapters (book_id) where book_id is not null;

comment on column public.chapters.is_preface is
  'When true, this chapter is the book preface — sits outside parts, never numbered, renders first.';
comment on column public.chapters.book_id is
  'Set only for preface chapters (part_id is null then). Regular chapters reach their book through parts.book_id.';

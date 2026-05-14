-- V022 — Book back cover
--
-- Marketing copy that appears on the back of the published book. Distinct
-- from `description` (which is a short blurb shown in the reader/library
-- landing): back cover is a longer, persuasive synopsis that the author
-- can author by hand or generate from the book's chapter summaries / full
-- text via the LLM (same routing as chapter upscale).
--
-- Plain text — not rich text — because back covers are typeset by the PDF
-- export and rendered as paragraphs. Stored on `books` (1:1).
--
-- Idempotent: safe to re-apply.

alter table public.books
  add column if not exists back_cover text;

comment on column public.books.back_cover is
  'Back-cover synopsis (plain text). Authored manually or generated from chapter content/summaries. NULL = none.';

-- V018 — Chapter header & footer
-- Optional rich-text framing (Tiptap HTML) shown above/below chapter content
-- in the reader and public reader views. Not versioned, not upscaled, not
-- searched, not annotatable. Authors are trusted to use them sparingly for
-- stylistic effects (epigraphs, accounting flavor lines, etc.).

alter table chapters
  add column chapter_header text,
  add column chapter_footer text;

comment on column chapters.chapter_header is
  'Optional rich-text (Tiptap HTML) rendered above chapter content in reader views. NULL or empty = render nothing.';

comment on column chapters.chapter_footer is
  'Optional rich-text (Tiptap HTML) rendered below chapter content in reader views. NULL or empty = render nothing.';

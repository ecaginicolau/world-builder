-- V019 — Book editions (print layouts)
--
-- A "book edition" is a print/PDF layout configuration attached to a book.
-- Multiple editions per book (e.g. one 6×9 with illustrations for trade
-- paperback, one 5×8 without illustrations for pocket). Each edition drives
-- a deterministic PDF export that should be uploadable directly to Amazon
-- KDP. Front/back matter (title page, copyright, ISBN, dedication, TOC) are
-- intentionally OUT OF SCOPE — KDP handles those separately.
--
-- Design choices:
--   - Config stored in semantic units (mm for margins, pt for font sizes,
--     font family name as text). Keeps the door open for a future HTML/CSS
--     WYSIWYG renderer that reads the same row.
--   - Mirror margins: `margin_inside` (gutter side) and `margin_outside`.
--     The PDF engine swaps left/right based on page parity.
--   - Header & footer behavior stored as plain columns rather than a JSON
--     blob — the field set is small and stable; columns play better with
--     Postgrest typing and codegen.
--   - Per-element typography (body, chapter title, header/footer, chapter
--     header, chapter footer) stored as flat `*_font_*` columns. JSON would
--     be marginally tidier but harder to query and harder to evolve with
--     additive ALTERs. Flat wins for now.
--   - `font_*` columns hold a font family identifier (e.g. "EB Garamond",
--     "Crimson Pro") that the renderer resolves to a registered TTF. We do
--     not store a path — keeps DB stable across font catalog changes.
--   - No "is_default" column: the first edition created is implicitly the
--     one offered when the user opens the book. Clients can let the user
--     pick another. Avoids edge cases when a user deletes the default.
--
-- Migration is idempotent: safe to re-apply.

create table if not exists public.book_editions (
  id                       uuid        primary key default gen_random_uuid(),
  book_id                  uuid        not null references public.books(id) on delete cascade,
  world_id                 uuid        not null references public.worlds(id) on delete cascade,
  owner_id                 uuid        not null references auth.users(id) on delete cascade,

  name                     text        not null check (length(name) between 1 and 100),

  -- Trim size in millimeters. Common KDP presets:
  --   5  × 8   = 127   × 203.2
  --   5.25× 8  = 133.35× 203.2
  --   5.5 × 8.5= 139.7 × 215.9
  --   6  × 9   = 152.4 × 228.6
  --   A5       = 148   × 210
  trim_width_mm            numeric(6,2) not null check (trim_width_mm  between 50 and 300),
  trim_height_mm           numeric(6,2) not null check (trim_height_mm between 50 and 400),

  -- Mirror margins. `inside` = gutter side (binding); `outside` = far side.
  -- The renderer maps these to left/right based on page parity (recto/verso).
  margin_inside_mm         numeric(5,2) not null default 19  check (margin_inside_mm  between 0 and 100),
  margin_outside_mm        numeric(5,2) not null default 13  check (margin_outside_mm between 0 and 100),
  margin_top_mm            numeric(5,2) not null default 19  check (margin_top_mm     between 0 and 100),
  margin_bottom_mm         numeric(5,2) not null default 19  check (margin_bottom_mm  between 0 and 100),

  -- Body content
  body_font                text        not null default 'EB Garamond',
  body_font_size_pt        numeric(4,1) not null default 11  check (body_font_size_pt   between 6 and 24),
  body_line_height         numeric(3,2) not null default 1.4 check (body_line_height    between 1 and 2.5),
  body_justify             boolean     not null default true,
  paragraph_indent_mm      numeric(4,2) not null default 4   check (paragraph_indent_mm between 0 and 30),

  -- Chapter title (rendered at top of each chapter's first page)
  chapter_title_font       text        not null default 'EB Garamond',
  chapter_title_size_pt    numeric(4,1) not null default 18 check (chapter_title_size_pt between 8 and 60),
  chapter_title_bold       boolean     not null default true,
  chapter_title_italic     boolean     not null default false,
  chapter_title_align      text        not null default 'center'
                            check (chapter_title_align in ('left','center','right')),
  drop_cap                 boolean     not null default false,

  -- Running header
  header_mode              text        not null default 'alternating'
                            check (header_mode in ('none','book_title','chapter_title','author','alternating')),
  header_show_on_chapter_first_page boolean not null default false,
  header_font              text        not null default 'EB Garamond',
  header_size_pt           numeric(4,1) not null default 9 check (header_size_pt between 6 and 16),
  header_italic            boolean     not null default true,

  -- Running footer (page numbers)
  footer_page_numbers      boolean     not null default true,
  footer_position          text        not null default 'outside'
                            check (footer_position in ('outside','center','inside')),
  footer_show_on_chapter_first_page boolean not null default true,
  footer_font              text        not null default 'EB Garamond',
  footer_size_pt           numeric(4,1) not null default 9 check (footer_size_pt between 6 and 16),

  -- Per-chapter framing (epigraphs, accounting flavor lines, etc.)
  -- Renders chapters.chapter_header / chapter_footer columns from V018
  chapter_header_font      text        not null default 'EB Garamond',
  chapter_header_size_pt   numeric(4,1) not null default 10 check (chapter_header_size_pt between 6 and 24),
  chapter_header_italic    boolean     not null default true,
  chapter_header_align     text        not null default 'center'
                            check (chapter_header_align in ('left','center','right')),

  chapter_footer_font      text        not null default 'EB Garamond',
  chapter_footer_size_pt   numeric(4,1) not null default 10 check (chapter_footer_size_pt between 6 and 24),
  chapter_footer_italic    boolean     not null default true,
  chapter_footer_align     text        not null default 'center'
                            check (chapter_footer_align in ('left','center','right')),

  -- Behavior toggles
  chapter_starts_on_recto  boolean     not null default true,
  include_illustrations    boolean     not null default true,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists book_editions_book_idx
  on public.book_editions (book_id, created_at);

create index if not exists book_editions_world_idx
  on public.book_editions (world_id);

drop trigger if exists book_editions_set_updated_at on public.book_editions;
create trigger book_editions_set_updated_at
  before update on public.book_editions
  for each row execute function public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────

alter table public.book_editions enable row level security;

drop policy if exists "owner full access on book_editions"
  on public.book_editions;

create policy "owner full access on book_editions"
  on public.book_editions
  for all
  using      (owner_id = auth.uid())
  with check (owner_id = auth.uid());

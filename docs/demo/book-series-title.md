# Demo — Book series title

## What changed
A book can now carry an optional **series title** — a short line displayed
above the book title on the PDF cover page.

- Free text, stored on `books.series_title` (nullable).
- No dedicated `series` table: sibling books in a series simply share the
  same string. Rename them together if the series gets renamed.
- Affects only the **cover page** (the title page). Chapter-only previews
  (`omitTitlePage: true`) are unaffected, as expected.

## Migration
Apply `supabase/migrations/V023__book_series_title.sql` in the Supabase
dashboard SQL editor before testing. Idempotent.

## Steps to validate

1. Open a world → Books → pick any book with at least one final chapter.
2. Above the title input you should see a new small uppercase field:
   *"Series (optional) — shown above the title on the PDF cover."*
3. Type a series name (e.g. `Chronicles of Arenwald — Book II`). Blur the
   field. The field commits on blur (same pattern as title / description).
4. Refresh — value persists.
5. Open the Book Editions panel, click **Preview PDF** on any edition.
   - Cover page (page 1) should show the series name in small italic
     uppercase tracking, centered, above the larger book title.
   - Book title and description are unchanged.
6. Click **Export PDF** — same cover layout in the downloaded file.
7. Clear the series field (empty) and re-preview — the series line is gone,
   cover reverts to title + description only.

## Negative cases

- A book with `series_title = NULL` (default for pre-existing rows): no
  series line on the cover.
- Chapter-only PDF preview (from a chapter screen): unchanged — no cover
  page is emitted in that flow.

## MCP parity
`create_book` and `update_book` MCP tools both accept an optional
`series_title` argument (nullish) so series management is scriptable.

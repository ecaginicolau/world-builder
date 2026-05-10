# Demo — Chapter header / footer

Optional rich-text framing rendered above and below the chapter content in the reader (and the public reader, and the PDF export). Not versioned, not upscaled, not searched, not annotatable. Pure stylistic flavor — epigraphs, accounting flavor lines, tags, etc.

## Migration

`supabase/migrations/V018__chapter_header_footer.sql` — adds two nullable `text` columns (`chapter_header`, `chapter_footer`) to the `chapters` table. **Apply via the Supabase SQL editor** before testing.

## What to validate

### 1. Edit a chapter from the app

1. Open any chapter in the editor (`/worlds/<id>/chapters/<chapterId>`).
2. Above the main editor: a thin Tiptap zone with placeholder *"Optional header (epigraph, accroche…) — empty = nothing rendered"*. Type a flavor line. Use **bold**, *italic*, headings via the usual Tiptap shortcuts — same toolbar/formatting as the main editor.
3. Below the main editor: same thing for the footer.
4. Wait ~400 ms (debounced autosave). No "save" button — it persists silently.
5. Reload the page → the header/footer text is still there.

### 2. Render in the authenticated reader

1. Click *Read* on a chapter that has a header and/or footer set.
2. The header renders **above** the chapter prose, the footer **below** — neutral styling (same `prose` class as the body, no italic, no centering imposed). All styling comes from what the author put inside via Tiptap.

### 3. Render in the public reader

1. Create a share link for the book (or reuse an existing one) and open `/r/<token>` in an incognito tab.
2. Open the chapter — header/footer must show, same neutral rendering.

### 4. Empty / null

1. Clear the header in the editor. The body becomes empty (`<p></p>`) → autosave persists `null`.
2. Reload the reader → no extra blank space, no empty container, nothing rendered.

### 5. PDF export

1. From the book detail page, click *Export PDF*.
2. Open the resulting PDF — chapters that have a header/footer show them as additional paragraphs above/below the chapter prose, after the *Chapitre N* heading.
3. Chapters without framing render as before (unchanged).

### 6. MCP tools (agent-side)

- `get_chapter` now returns `chapter_header` and `chapter_footer` in its payload.
- New `update_chapter_framing(chapter_id, chapter_header?, chapter_footer?)`:
  - Pass plain text or Tiptap HTML — plain text is auto-wrapped server-side.
  - Omit a field → leaves it untouched.
  - Pass `null` or `""` → clears it.
  - **Does not re-send the chapter content**, so token-cheap to call repeatedly.

Try from a chat:
> *"Sur le chapitre <uuid>, mets en header la phrase comptable suivante : « Le bilan ne s'équilibre pas — quelqu'un ment. »"*

Verify the chapter detail page picks it up immediately (TanStack Query refetch) and that the reader views render it.

## What is **not** included by design

- No versioning of the framing (no entry in `chapter_versions`, no upscale, no proposals).
- Not in search / PCC / summaries — the framing is not narrative content.
- Not annotatable from the public reader (annotations only target the chapter body — confirmed: only the body div is wired to `SelectionToolbar`).
- No dedicated UI to "remove header/footer" beyond clearing the editor — empty Tiptap content is treated as null on save.

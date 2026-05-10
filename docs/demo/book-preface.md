# Demo — Book preface

A "preface" is an optional special chapter attached to a book that:

- always renders **first** (PDF export, in-app reader, public reader)
- is **not numbered** (no "Chapitre N" prefix)
- sits **outside the part hierarchy** (it is not in any part)
- is **not on the canon timeline** (no events, no entity tagging UI)
- otherwise behaves like any chapter (rich-text editor, versions, header/footer, illustrations, draft/published status)

One preface per book max.

---

## Apply the migration

Run `supabase/migrations/V020__book_preface.sql` against the cloud Supabase project (SQL editor). The migration is idempotent — safe to re-apply.

---

## Re-deploy the public-reader edge function

The `getChapter`, `resolveLink`, and `postAnnotation` actions changed — re-deploy:

```
supabase functions deploy public-reader --no-verify-jwt
```

---

## Try it (golden path)

1. Open a book → `/worlds/<id>/books/<bookId>`.
2. The new **Preface** section appears between the book header and the parts list.
   - Empty case: a `+ Add preface` button.
   - Existing case: a row linking to the preface chapter, plus a `delete` button.
3. Click **+ Add preface** → routes you to the chapter editor.
4. The chapter editor shows:
   - Header label = `Preface` (instead of `Chapter N`).
   - No `Propose canon` button.
   - No events/entities side panels (replaced by a small note).
   - Otherwise: normal Tiptap editor, versions panel, header/footer fields, publish toggle.
5. Type some content. Save. Toggle **Publish**.
6. Go to the in-app reader → `/worlds/<id>/read`.
   - Each book now shows a **Preface** sub-section above its parts.
   - Click the preface link → it renders first; **Prev** is disabled, **Next** points to chapter 1 of the first part.
7. Open a regular chapter — its number is still `Chapter N` (the preface does **not** count).
8. From the book detail page → **Export PDF** (any edition).
   - First page after the title page is the preface, with title `Preface` (or your custom title), no chapter number.
   - The first regular chapter is still `Chapitre 1`.
9. Public reader (share-link flow):
   - Open the share link.
   - The TOC shows a **Preface** section above parts.
   - Click → preface renders first; prev/next navigation skips no chapter.

---

## Edge cases to spot-check

- **Delete a preface**: the book detail page reverts to the empty state with a fresh `+ Add preface` button.
- **Two prefaces?** Not possible — DB has a partial unique index `chapters_one_preface_per_book`. The UI hides the add button once one exists.
- **Word count**: the book total at the top of the book detail page **includes** the preface's word count.
- **Draft preface in public reader**: only visible if the share link has `include_drafts = true`, same rule as regular chapters.
- **PDF running header**: in `chapter_title` / `alternating` modes, the header reads the preface's own title (or `Preface` if untitled), not `Chapitre 0`.

---

## What we did NOT do (intentional)

- Prefaces have no event/entity tagging UI — they are out of scope of the canon timeline by design.
  - The DB columns still exist, so a future need can be addressed without another migration.
- No "afterword" / "epilogue" symmetry yet — preface only. Same pattern can be cloned later if needed.
- MCP tools (`list_chapters`, `create_chapter`) were not updated to expose `is_preface`. Currently:
  - `create_chapter` cannot create a preface (forces a `part_id`).
  - `list_chapters` returns prefaces as ordinary chapters with `position` 1, which would inflate every chapter by 1. **Use the UI to manage prefaces** until the MCP gets a separate `create_preface` tool.

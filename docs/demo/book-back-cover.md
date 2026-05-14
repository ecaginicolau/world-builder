# Demo — Book back cover

A new field on every book to hold the **back-cover synopsis** — the persuasive
120–200-word pitch that goes on the back of a printed novel. Distinct from the
book's short `description` (which is a brief blurb shown on the library /
reader landing).

The back cover can be:

- **stored** on the book (`books.back_cover`, plain text, nullable),
- **edited** in a textarea on the book detail page,
- **generated** from the book's chapter content via the LLM — using chapter
  summaries (preferred) or the full chapter text as the source material.

Routed through the same task slot as chapter `upscale` (creative writing →
prefers the best-tier cloud model, or the configured local model for the
`upscale` task). Logged in `runs` under a new `back_cover` kind.

---

## Apply the migration

Run `supabase/migrations/V022__book_back_cover.sql` against the cloud
Supabase project (SQL editor). Idempotent — safe to re-apply.

---

## Try it (golden path)

1. Open a book → `/worlds/<id>/books/<bookId>`.
2. Between the parts list and the **Book editions** panel you'll see a new
   **Back cover** section (`data-testid="back-cover-panel"`).
3. Empty case: a tall textarea, a **Source** dropdown, an optional **Author
   guidance** input, plus **Generate** / **Save** buttons.
4. Make sure your book has at least one chapter with either a saved final
   version or a generated summary (S/M/L). The footer of the panel shows the
   chapter count it will use.
5. Pick a **Source** strategy:
   - `Best summary available` (default) — for each chapter, uses L → M → S →
     full text in order, whichever is first non-empty.
   - `Long / Medium / Short summaries` — prefer that length, fall through the
     others, fall back to text only if everything else is empty.
   - `Full chapter text` — sends each chapter's final text (truncated at
     ~6 000 chars per chapter to keep the prompt bounded). Slower / costlier.
6. Optionally write author guidance — e.g. *"emphasize the rivalry between the
   twins"* or *"PG-13 tone, no spoilers past chapter 3"*.
7. Click **Generate**. The textarea fills with the LLM output (you can still
   edit before saving). The audit row appears in
   `/worlds/<id>/runs` with `kind = back_cover`, `parent_id = <bookId>`.
8. Tweak by hand → **Save**. The text is persisted to `books.back_cover`.
9. Reload the page — your back cover is still there. If you re-open the panel
   and click **Generate** again, you'll get a confirm dialog warning that the
   existing text will be overwritten (the save isn't touched until you press
   Save again).

---

## Edge cases to spot-check

- **Empty book**: with zero chapters, the **Generate** button is disabled and
  the footer reads *"0 chapters in this book."*.
- **All chapters summary-less**: with `Best summary available`, the panel
  falls back to full text automatically. The system prompt sent to the LLM is
  switched from "Chapter summaries (in reading order)" to "Chapter full text
  (in reading order, truncated)".
- **Preface inclusion**: the book preface (if any) is included as the first
  "chapter" in the input — its summary or text contributes to the synopsis.
- **Save with empty textarea**: clears the field (`back_cover = null`).
- **Mock LLM**: with `VITE_LLM_PROVIDER` unset / `mock`, the generator returns
  a deterministic stub including chapter titles and the user prompt, so the
  whole UI is testable without an API key.

---

## What we did NOT do (intentional, follow-ups)

- **PDF rendering**: the back cover is **not** yet printed as a back-cover
  page in the exported PDF. Each `BookEdition` already controls trim size and
  margins — adding a back-cover page is a separate small task on top of
  `bookPdfExport.tsx`.
- **Public reader display**: the back cover is not yet shown on the share-link
  landing page. The short `description` continues to be used there.
- **Versioning**: only the current value is stored (overwritten on each
  Save / Generate). The `runs` row keeps an audit trail of generations, but
  the produced text itself is not history-tracked the way chapter versions
  are. Add chapter-version-style history later if the user asks.
- **MCP**: the existing `update_book` tool was extended to accept a
  `back_cover` field; no dedicated `generate_back_cover` action was added
  yet. Agents that want to (re)write a back cover should generate the text
  themselves and call `update_book`.

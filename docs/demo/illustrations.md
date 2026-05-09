# Demo: Illustrations

Add illustrations to entities, embed them inline in chapter prose, and see them rendered in the chapter editor, the PDF export, and the public reader.

> **Prerequisites**
> - Migration `V017__slice_illustrations.sql` applied (creates `entity_illustrations` table + `illustrations` Storage bucket + RLS policies).
> - Public-reader Edge Function redeployed: `supabase functions deploy public-reader --no-verify-jwt` (only needed if you want to test the public reader path; the rest works without).

## 1. Upload illustrations on an entity

1. Open any entity from **Entities** (e.g. a character).
2. Scroll to the **Illustrations** section at the bottom of the page.
3. Click **+ Add image**, pick a JPEG/PNG/WEBP/GIF/AVIF file (≤ 10 MB).
4. The image appears in the grid within ~1 second.
5. Repeat for a couple more illustrations on the same or different entities.

**Edit / reorder / delete**: click any thumbnail to open the modal. You can:
- Edit the **caption** (displayed below the image in chapter / public reader / PDF).
- Edit the **alt text** (for accessibility).
- Move the illustration **← Earlier** / **Later →** in the entity's list.
- **Delete** the illustration. Note: chapters that already embed it will show a small "[illustration unavailable]" placeholder.

## 2. Insert an illustration in a chapter

1. Open any chapter from **Books → [book] → [chapter]**.
2. At the top right of the editor, click **+ Insert illustration**.
3. The picker shows illustrations grouped by entity. Entities tagged on the current chapter (in **Linked entities**) appear first with a `IN THIS CHAPTER` badge.
4. Use the search box to filter by entity name or caption.
5. Click any thumbnail. The illustration is inserted as a block at the cursor position.
6. The image renders in the editor with the caption below and a small **Remove from chapter** button to take it out.
7. Drag the illustration block to move it within the chapter (Tiptap drag-handle).

**Note**: the illustration is stored in the chapter content as `<figure data-illustration-id="…">`. The image URL is resolved at render time. If you delete the illustration on the entity later, the chapter shows a placeholder instead — no DB cleanup needed.

## 3. Verify in PDF export

1. Go to **Books → [book]** and click **Export PDF**.
2. The PDF generates with all illustrations embedded inline at A5 size, fitted to the page width, with the caption underneath in italic.
3. Each illustration is `wrap={false}` so it won't be split across pages — react-pdf will move it to the next page if it doesn't fit.

## 4. Verify in public reader

> Requires the public-reader Edge Function to be redeployed.

1. From **Books → [book]**, create or open a public reader link, then open it in a new tab.
2. Navigate to a chapter that contains an illustration.
3. The illustration renders at the position you placed it, with `max-height: 70vh` and centered, caption in italic below.
4. Selection-based annotations (👍 👎 💬) still work around the figure — they wrap text only, so figures are unaffected.

## What to validate

- [ ] Upload a 2 MB+ image: shows up at full quality (no client-side downscale in v1).
- [ ] Caption editing autosaves on blur.
- [ ] Picker shows participant entities first.
- [ ] Search filters by entity name AND caption.
- [ ] Inserting in the editor shows the rendered image, not raw HTML.
- [ ] Deleting an illustration on the entity makes the embedded chapter node show "[illustration unavailable]" placeholder.
- [ ] PDF export embeds the image with correct aspect ratio and caption.
- [ ] Public reader (after redeploy) hydrates and displays the figure.

## Known v1 limitations

- **No client-side resize**: a 4K photo uploads at ~5 MB and is served at full size. Read-view loads will be slower for very heavy images. v2 will keep both a thumbnail and the full-res variant.
- **Single linkage**: each illustration is bound to exactly one entity. Free-floating illustrations (landscapes / scenes / maps with no entity) are not supported in v1.
- **No batch upload**: one file per click on `+ Add image`.
- **No drag-drop into the editor**: insertion is via the picker. Tiptap supports drag-drop of files in principle; deferred to a follow-up.

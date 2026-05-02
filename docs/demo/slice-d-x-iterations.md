# Slice (d.x) — Post-(d) iterations · demo walkthrough

~5 min. Validates the 4 packets shipped after live-validating slice (d).

## Pre-requisites

- V012 + V013 applied.
- A world with at least 1 Book + Part + a couple of events (to play with reorder + per-field edits).

## 1. Reorder chapters in a Part

Open **Books → your book**. Each chapter row now has ▲▼ buttons on the left edge.
- ▲ disabled on the first row, ▼ disabled on the last.
- Click ▲ on Chapter 3 → it swaps with Chapter 2. Persisted via `chapters.reading_rank` (fractional indexing, sort client-side).

Does NOT change the chronological order on the timeline — that's derived from each chapter's linked events.

## 2. EventScreen editor matches Chapter editor

Open any event. The middle column is the Tiptap editor.
- Click anywhere in the empty zone → focus enters the editor (was broken before, click did nothing).
- Editor has `min-h-[40vh]` (was 1 line tall).
- Type some text mentioning known entities (Iria, Vieille Forteresse) → live highlight on those words.
- Reload the page → text persisted to `events.description_html`, plain text mirrored to `events.description`.

## 3. Manual edit on chapter version → autosave + 📌 Snapshot

Open a chapter. In the right Versions panel, click any **Manual edit** version (NOT a Draft, NOT an Upscale).
- Banner at top of panel: **"Editing in place · autosave on · 📌 Snapshot"**.
- Type something in the editor → no banner appears (autosave silently writes back to that same version row).
- Click **📌 Snapshot** → forks the current text into a brand new `manual_edit` row, marks it final. The old row is preserved untouched as a roll-back point.

For comparison:
- Editing **Draft (v0)** → still autosaves silently (no banner, no fork).
- Editing **Upscale** → still produces the yellow "Unsaved manual edits" banner with `Save as new version` button (preserves the LLM original).

## 4. entity_versions per-field editable in place

This is the model change. Open any entity (Iria for example). The right pane shows a `FieldsEditor` instead of the old read-only FieldsCard + AnchorVersionList.

### Default cursor = current view

Lands on the latest anchor (the rightmost in the rail), so you see the "current state" of the entity. No more "— current —" pseudo-anchor.

### Edit any field at any anchor

- Click the **initial** anchor in the rail.
- Type in `bio`: "Jeune femme intrépide" → `Tab` to blur. Autosave.
- TIMELINE counter: `(0 versions) → (1 version)`. Init dot fills in.

Now click an anchor mid-timeline (e.g. "after Maitre Sorn prêche aux survivants").
- `bio` displays the inherited value with `(inherited from initial)` italic suffix and faded color. There's NO ↺ button (you can't reset what's not explicitly set here).
- Type `21` in `age` → Tab. Autosave creates a new version anchored at this event. TIMELINE: `(2 versions)`. The new version's snapshot is just `{age: 21}` — bio stays inherited from init, NOT duplicated.
- `age` now shows in clear color (not italic), `(inherited from initial)` is gone, and a small **↺** appears next to the field name.

### Inheritance walks per field

- Navigate to an anchor LATER (e.g. "after Edran reste impassible") → `age (inherited from earlier event) · 21`, `bio (inherited from initial)`.
- Navigate to an anchor EARLIER (e.g. "after Le résultat de la grande bataille") → `age (never set)` (the future value does NOT leak backwards), `bio` still inherited from initial.

### Reset a field

On the anchor where you set `age=21`, click the **↺** next to `age`.
- The version's snapshot loses the `age` key.
- If the snapshot becomes empty AND the version is event-anchored, the row is DELETED. Init versions are never deleted (always 1 per entity).
- `age` falls back to inheritance from earlier versions.

## 5. Propose canon stores deltas

Open a chapter with linked entities, click **Propose canon**, run analysis. The LLM produces events with `entityDiffs`. Accept all.

Open one of the affected entities. The new event-anchored version's snapshot contains ONLY the fields the LLM touched (e.g. `{bio: "L'avant-bras gauche…", alive: true}`), NOT the full merged snapshot. Verify by:
- Opening Supabase SQL editor: `select snapshot from entity_versions where source_event_id = '<event-id>';` → should be a tight delta object.
- In the EntityDetailScreen: at that anchor, the changed fields show in clear color with ↺ available. Other fields show as `(inherited from initial / earlier event)` italic.

## What to look out for

- **Race condition on parallel blurs**: if you tab between two fields very fast, both blur handlers fire onSetField in parallel. The mutation handles this via INSERT-then-fallback-UPDATE on unique conflict (Postgres error 23505). Both writes land cleanly, no row vanishes.
- **Init v0 stays even when emptied**: `useResetEntityField` doesn't delete the init version. It can sit around with `snapshot={}` (the entity has no initial values for that field). Later edits will re-fill it.
- **Anchors only show events** (not chapters): per the (d) pivot, entity_versions can only anchor to events. Chapter-derived anchors would coincide with their earliest event anyway — they're filtered out.
- **`note_excerpt`** (LLM justification) is left untouched when you edit manually. The next propose-canon run on the same event will overwrite it with a new justif. To clear it, ↺ the field then re-set (the row is recreated with no justif).

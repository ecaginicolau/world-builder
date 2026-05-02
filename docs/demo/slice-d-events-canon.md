# Slice (d) — Events as canonical source · demo walkthrough

~5 min. Validates the post-v1 pivot: **events are the canon, chapters retell them**.

## Pre-requisites

- V012 applied (drops `chapters.chronological_rank` + `entity_versions.source_chapter_id`, adds `chapter_events`/`event_participants` pivots, allows `chat_threads.parent_kind='event'`).
- A world with at least one Book + Part + a couple of existing events (otherwise create as you go).

## 1. Timeline is now events-first

Open the **Timeline** tab on a world.

- Headline now says `N events` (no more `N chapters · M events`).
- Each row shows: ↑/↓ chrono reorder · `📅 Event` (+ `OFF-SCREEN` badge if no chapter retells it yet) · title · description · entity participants chips · **chips of chapters that retell it** (`📖 Title`).
- Hover an off-screen badge: tooltip "No chapter is currently retelling this event".
- Click a chapter chip → opens the chapter.

## 2. Chapter creation forces a first event

Open **Books → Tome 1 → Part X**.

The "+ Chapter" form is now **two inputs**:
- *New chapter title (optional)*
- *First event title — required* (button greys out if empty)

Helper text: "Every chapter retells an event on the canonical timeline. Pick a title for that first event — you can rename it later."

Type:
- chapter title `Le sermon des cendres`
- first event title `Maitre Sorn prêche aux survivants`

Click `+ Chapter` → redirected to the new ChapterScreen. Behind the scenes: insert chapter + insert event (chrono = end of timeline) + insert chapter_events link. All in one mutation.

## 3. ChapterScreen — Events covered panel

Header now shows badges:
- `NO EVENTS LINKED` (amber, only if 0 events) — tells you the chapter is invisible from the timeline.
- `Prose changed` (sky) — appears when `chapters.last_analyzed_at < final_version.updated_at` (= you re-tweaked the prose since the last canon analysis).
- `PUBLISHED` (emerald) — unchanged.

Header button renamed: **"Propose canon"** (was "Propose updates").

Left aside, top section: **EVENTS COVERED (n)**:
- Linked events listed with `▲▼` narrative-rank reorder, link to the EventScreen, `✕` unlink (event itself stays).
- `+ Link` opens a select of unlinked events; `+ New` opens an inline title input that creates a fresh event (placed at the end of world chrono) and links it.

For chapters that pre-date the migration with 0 events linked: the orange warning banner inside the panel says "⚠ No events linked. This chapter is hidden from the timeline. Add at least one event."

## 4. The propose-canon funnel

On a chapter with prose + linked entities (e.g. *Confrontation à la forteresse* with Iria/Maitre Sorn/Edran Voss/Vieille Forteresse), click **Propose canon**.

Modal shows: "Reads the chapter prose and proposes canonical events. Each event becomes a row on the timeline, gets linked to this chapter, and can carry entity updates that anchor on it. Linked entities in scope: 4."

Click **Run analysis** → ~3-10s OpenAI roundtrip (look for `propose_updates` in Monitoring).

Result UI: `N events proposed`, each card shows:
- `📅 Event title`
- short factual description
- list of entity diffs with checkboxes (default checked). Each diff: entity name · `field`: → `newValue` · italic justification quote.
- per-event Skip / Accept event buttons. `Accept all` at the top.

Click **Accept all** (or per-event accept). Each accept inserts (in order):
1. Event row (chrono = end of timeline).
2. `chapter_events` link (narrative_rank = end of chapter chain).
3. `event_participants` row per accepted-diff entity.
4. New `entity_versions` (one per accepted diff) with `source_event_id` = new event id, `valid_from_rank` = `rankAfterEvent(eventChronoRank, …)`, `note_excerpt` = LLM justification.

After accept-all: the modal cards say `accepted` (green); the chapter header loses `NO EVENTS LINKED`; `EVENTS COVERED (N)` lists the new events; the chapter mutates `last_analyzed_at` so the `Prose changed` badge clears.

## 5. EventScreen (chapter-light workspace)

Click any event in the timeline → `/worlds/$worldId/events/$eventId`.

3-column layout mirroring chapters but lighter:
- Header: `← Timeline | OFF-SCREEN badge (conditional) · #N of M Delete`.
- Title input (editable, blur to save).
- `TOLD IN CHAPTERS:` chips (links to each chapter).
- Left: LinkedEntitiesPanel + DetectedEntitiesPanel (calque of Chapter side, but on `event_participants`).
- Center: rich Tiptap editor (paragraph + bold/italic + lists) for `events.description_html`, autosaves on blur of focused user typing. `events.description` (plain text) is kept in sync for FTS/fallback.
- Right: ChatPanel with `parentKind='event'` — uses world memory + linked entities + this event's plain text.

## 6. Entity rail picks up event-anchored versions

Open an entity that received updates (e.g. Iria after step 4).

- TimelineRail anchors include the new events (`after 📅 Sorn brise le bras d'Iria · 1 update`).
- Selecting that anchor shows the snapshot post-event (`bio: L'avant-bras gauche a été brisé par Maitre Sorn devant la Vieille Forteresse`, `alive: true`).
- The "+ New version…" button is gone — replaced by a small italic hint **"Updates flow through events"** with a tooltip explaining that entity state changes by accepting events from a chapter or the canon-side flow on an EventScreen.

## 7. NoteScreen — no more Promote → version

Open any note. Header buttons are now: `Promote → chapter` · `Promote → event` (the third "Promote → version" is gone).

`Promote → chapter` modal now also asks for **First event title** (pre-filled from note title), required. The behind-the-scenes flow is the same as in step 2.

## What to look out for / known cosmetic glitches

- **Off-screen events in a freshly migrated world**: the V012 migration truncates `entity_versions` and `chapters.chronological_rank` is dropped, so existing events stay but lose their chapter pairing. Expect `OFF-SCREEN` badges on every pre-migration event until you link them via `+ Link` from a chapter's Events covered panel.
- **No events linked = no PCC participation**: a chapter with 0 events has no chrono position, so it's excluded from "Previous chapter context" both as source and as anchor. Link an event to bring it back.
- **Chat on event** lives in `chat_threads` with `parent_kind='event'`. V012 drops the old CHECK constraint and re-adds it including `'event'` — if you applied V012 before this addition was added, re-apply it (idempotent).

## Snapshots taken during the smoke

- Timeline with 5 events including 2 freshly-accepted from canon flow → chapter chips visible on rows #4 and #5.
- ChapterScreen with the new EVENTS COVERED panel + NO EVENTS LINKED → linked-events flow.
- Propose canon modal post-Run analysis → 2 events proposed with checkboxes per diff and justification quotes.
- EntityDetailScreen rail post-accept → new "after Sorn brise le bras d'Iria · 1 update" anchor selected, snapshot resolved.

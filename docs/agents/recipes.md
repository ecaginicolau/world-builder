# Agent recipes

Five operational recipes for the World Builder agents. Each recipe = one user-facing flow, step-by-step. All assume the slash commands are wired (see [setup.md](./setup.md)).

> Format: `[input you type]` → "what the agent does" → `[input you type next]`. Lines starting with `mcp__world-builder__` are tool calls the agent makes.

---

## Recipe A — Draft a new chapter from scratch

**When**: you have a creative brief in your head and want a working chapter end-to-end without manually wiring entities and events.

**Persona**: Drafter (V2 stance — decisive).

```
[/drafter]
```

Agent: calls `list_worlds`, asks one sentence: "Which world and what to draft?".

```
World 'Ashen Crowns'. New chapter where Iria sneaks into the cellar of the Vieille Forteresse at night and finds an unsigned letter mentioning a "second betrayal".
```

Agent boots: `get_writing_guide(world_id)`, then runs the flow:

1. `create_note` — captures the brief as a brainstorm note.
2. `auto_extract_from_note` — surfaces candidates (Iria, Vieille Forteresse, the letter, the cellar).
3. For each accepted candidate not yet in canon: `create_entity` with the right type, then `link_entity_to_chapter` (after step 4).
4. `create_chapter` — `first_event_title="Iria descends into the cellar"`, `reading_rank` auto-appended.
5. `append_chapter_version(origin='manual_edit', text=<draft prose>, make_final=true)`.
6. Possibly `upscale_chapter(user_prompt='tighten rhythm, lean into the dark-fantasy tone')`.
7. `propose_canon_from_chapter` — review diffs, apply uncontroversial via `set_entity_field` / `create_event` / `link_*`. Surface contradictory ones.

Agent surfaces the draft in a fenced markdown block + a summary of writes.

```
[review draft] keep upscale v2 as final. apply all entity diffs. don't add the 'second traitor' event yet — i want to think about it.
```

Agent: applies the entity diffs, leaves the contested event out, narrates the writes.

**Verify**: open the app → `/agent-activity` (writes) and `/runs` (intents). The chapter is in the BookDetail view; the upscale version sits in the VersionsPanel.

---

## Recipe B — Audit a chapter for canon coherence

**When**: a chapter is drafted and you want a coherence pass before publishing or before sending to the Editor.

**Persona**: Continuity Checker (V3 stance — read first, write rarely).

```
[/continuity]
```

Agent: `list_worlds`, asks "Which chapter or world segment to audit?".

```
Audit chapter "Confrontation à la forteresse" in Ashen Crowns.
```

Agent boots and reads:

1. `get_writing_guide(world_id)` — aligns on business rules.
2. `get_chapter` (with text) + `get_pcc` for the chapter.
3. `list_events` filtered to the chapter via `chapter_events`, plus `get_event` on each.
4. For every participant: `get_entity_state_at_rank(entity_id, rank)` at the chapter's chronological rank.
5. Cross-checks the prose against the canonical state.

Agent surfaces a numbered list:

```
3 findings · 1 high · 2 medium.

1. [HIGH] "Iria leva sa main droite" — canon says her right arm was broken at rank R8 (source: event "Sorn brise le bras d'Iria"). Severity: high.
   Suggested fix: change "main droite" → "main gauche" (manual_edit), or move this scene before R8.

2. [MEDIUM] "Edran portait l'épée du Capitaine" — canon says Edran lost the sword at rank R5 (source: event "Edran cède l'épée"). Severity: medium.
   Suggested fix: change "épée du Capitaine" → "lame d'emprunt", or reverse the loss event if intentional.

3. [MEDIUM] "lune pleine" — canon says world has only one moon, at half-phase per the world_memory. Severity: medium.
   Suggested fix: change "lune pleine" → "demi-lune".
```

```
[user] apply 1 and 3 as manual_edit fixes. leave 2, that's intentional drift i'll resolve next chapter.
```

Agent: appends a `manual_edit` chapter version with the two text edits, doesn't touch finding 2, narrates.

**Verify**: chapter VersionsPanel shows the new manual_edit version; `/agent-activity` logs the writes.

---

## Recipe C — Expand an entity (add backstory, traits, secrets)

**When**: an entity feels thin — sparse fields, no version history, just a name and type.

**Persona**: World Expander.

```
[/world-expander]
```

Agent: `list_worlds`, asks "Which entity or area to expand?".

```
Iria in Ashen Crowns — she's central to chapter 1 but i never filled out her bio.
```

Agent boots:

1. `get_writing_guide(world_id)`.
2. `get_entity(iria_id)` + `list_entity_versions` + `list_events` filtered by participant + `list_chapters` where she appears.
3. Synthesizes: "Iria is a young woman, intrepid, currently bears a broken left arm (since R8). Currently no canonical hometown, motivation, or fear. Has appeared in 2 chapters."

Then surfaces 3 pitches:

```
1. **Hometown — fishing village destroyed by raid** (would `set_entity_field hometown` at init: "Vendor"). Backstory hook.

2. **Fear of confined spaces** (would `set_entity_field fear` at init). Plays well with the Vieille Forteresse cellar scene.

3. **Lost a younger brother to the same Order Sorn belongs to** (would `create_event` "Erran's death" at rank R-low + `link_entity_to_event` + `set_entity_field motivation` at init: "avenge Erran"). Big — gives motivation.
```

```
[user] apply 1 and 2. leave 3 for later.
```

Agent: `set_entity_field(iria_id, fieldName='hometown', value='Vendor', validFromRank=<init>)`, same for `fear`. Narrates.

**Verify**: `EntityDetailScreen` for Iria — 2 new init-anchor field values, badge `(inherited from initial)` propagates to all anchors.

---

## Recipe D — Polish a chapter for publication

**When**: a chapter is structurally complete (prose drafted, canon applied, summaries unset). Time for a line edit before publish.

**Persona**: Editor.

```
[/editor]
```

Agent: `list_worlds`, asks "Which chapter to polish?".

```
"Confrontation à la forteresse" in Ashen Crowns.
```

Agent boots:

1. `get_chapter` (with text) + `get_pcc` + `get_chapter_summary` for any existing levels + `get_writing_guide`.
2. Reads end to end.

Surfaces findings:

```
12 findings (3 rhythm · 4 repetition · 3 weak-verbs · 2 dialog tags).

**[Rhythm]** L4: "Le silence était total et lourd et pesant comme..." — 3-adj run flattens the cadence. Drop "lourd".
**[Rhythm]** L18: 7 sentences in a row under 5 words — choppy where calm is wanted.
...
**[Repetition]** "regard" appears 6 times in 12 lines — vary with "œil", "coup d'œil", or omit.
...
**[Weak-verbs]** L31: "elle commença à comprendre" — "elle comprit".
...
```

```
[user] apply rhythm 1, all repetition fixes, all weak-verbs. leave dialog tags.
```

Agent: `append_chapter_version(origin='manual_edit', text=<edited prose>, make_final=true)`. Then asks: "Publish-ready? I'll generate fresh S/M/L summaries."

```
[user] yes
```

Agent: `summarize_chapter(level='S')`, then `level='M'`, then `level='L'`. Narrates.

**Verify**: chapter has 3 fresh summaries; new manual_edit version is final.

> **Don't** ask the agent to publish. Use the app — that's a deliberate human step.

---

## Recipe E — Cascade Drafter → Editor

**When**: you want a fully drafted-and-polished chapter in one session.

```
[/drafter]
World 'Ashen Crowns'. New chapter: Iria, in the cellar, deciphers the unsigned letter.
[run Recipe A end to end]
```

Once the Drafter narrates "draft v2 final, canon applied":

```
[/editor]
Polish the chapter we just drafted.
```

The Editor agent boots and identifies the chapter (typically the most recently updated one — confirm via `list_chapters`). Then runs Recipe D.

> Drafter and Editor have **different stances** (decisive vs polish). Don't try to make one do both. Switching personas is the cheap part.

---

## Tips

- **Interrupt freely**. All agents are decisive but redirectable. "Stop, don't apply that diff" works.
- **Use `/runs` and `/agent-activity`** as your audit trail. If the agent did something surprising, it's logged.
- **One question per cycle** is the V2 contract. If an agent asks more, the system prompt is drifting — file it as a tuning observation.
- **Check the chapter VersionsPanel** before accepting Editor's final version. Compare against the upscale or the previous manual_edit.
- **Local LLM**: route `extract` to a cheap local model (Qwen 7B), keep `upscale` and `summarize` cloud (quality matters there). Configure in Settings → Local LLM.

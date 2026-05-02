// `get_writing_guide` payload — the agent reads this once at session start to
// learn the world's lore, the user's voice/style guidance, and the flow it is
// expected to follow. Tuned iteratively in slice 2b based on how Claude
// Desktop / claude-code consume it.

export type WritingGuide = {
  world_memory: string;
  custom_prompt: string;
  flow_recipe: {
    description: string;
    steps: string[];
  };
  business_rules: string[];
  conventions: {
    rank_format: string;
    field_kinds: string;
    pinning: string;
  };
};

export function buildWritingGuide(input: {
  worldMemory: string;
  customPrompt: string;
}): WritingGuide {
  return {
    world_memory: input.worldMemory,
    custom_prompt: input.customPrompt,
    flow_recipe: {
      description: "Recommended flow for drafting a chapter",
      steps: [
        "1. Create a brainstorm note with rough ideas, character motivations, scene setting (create_note).",
        "2. Call auto_extract_from_note → review candidates → create new entities/events as needed via primitives (create_entity, create_event, link_entity_to_event, ...).",
        "3. Once the note is materially complete, create a chapter with create_chapter — first_event_title is REQUIRED (a chapter cannot exist without at least one linked event).",
        "4. Append an initial draft with append_chapter_version (origin='manual_edit').",
        "5. Call upscale_chapter when the user is ready to refine prose with the LLM. The result becomes the new final version automatically.",
        "6. Call propose_canon_from_chapter to extract events + entity diffs from the prose; review and apply via primitives (create_event, set_entity_field, link_event_to_chapter).",
        "7. Call summarize_chapter at level 's', 'm', 'l' once the prose is final, so the next chapter's PCC has summaries to inject.",
      ],
    },
    business_rules: [
      "A chapter cannot exist without at least one linked event (enforced at create_chapter).",
      "Entity versions are field-deltas: only set fields that explicitly change at that event's anchor. Earlier values are inherited automatically per-field.",
      "Events drive the canonical timeline. A chapter's chronological position is derived from min(linked event chronological_rank).",
      "Same event can be retold across multiple chapters — chapter_events.narrative_rank orders the events within a chapter.",
      "Published chapters block all mutations (edit, upscale, propose, summary). Unpublish first if you need to make changes.",
      "Reset an entity field at an event = reset_entity_field; the version row is deleted if its snapshot becomes empty (init versions are never deleted).",
      "set_entity_field is race-safe (insert-then-update on conflict): the same (entity_id, source_event_id) only ever has one version row.",
      "All writes performed via this MCP server are logged in agent_actions and visible in the app's /agent-activity view.",
    ],
    conventions: {
      rank_format:
        "Ranks are fractional indexing strings (e.g. 'a0', 'a0V', '!init'). To insert/move, ask the user to reorder via UI or compute the midpoint between two existing ranks. Never write raw integers.",
      field_kinds: "string | text | int | bool only (v1).",
      pinning:
        "Mark entity-event / entity-chapter links as pinned=true if you want to override LLM auto-detection from prose at the next propose_canon call.",
    },
  };
}

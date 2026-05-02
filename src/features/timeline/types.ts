export interface TimelineEvent {
  id: string;
  world_id: string;
  owner_id: string;
  chronological_rank: string;
  title: string;
  description: string | null;
  description_html: string | null;
  tags: string[];
  source_note_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Pivot row linking an event to a chapter that retells it. */
export interface ChapterEvent {
  chapter_id: string;
  event_id: string;
  world_id: string;
  owner_id: string;
  /** Order of this event within the chapter's narrative (text-fractional). */
  narrative_rank: string;
  created_at: string;
}

/** Pivot row linking an entity to an event (calque of chapter_participants). */
export interface EventParticipant {
  event_id: string;
  entity_id: string;
  world_id: string;
  owner_id: string;
  pinned_manually: boolean;
  created_at: string;
}

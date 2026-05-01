export interface EntityType {
  id: string;
  world_id: string;
  owner_id: string;
  name: string;
  icon: string | null;
  fields: unknown[];
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  world_id: string;
  owner_id: string;
  entity_type_id: string;
  name: string;
  aliases: string[];
  tags: string[];
  source_note_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteEntity {
  note_id: string;
  entity_id: string;
  owner_id: string;
  pinned_manually: boolean;
  created_at: string;
}

/** Entity + its type, joined for prompt context and UI display. */
export interface EntityWithType extends Entity {
  type_name: string;
}

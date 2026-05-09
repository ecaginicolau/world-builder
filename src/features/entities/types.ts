export type FieldKind = 'string' | 'text' | 'int' | 'bool';

export interface FieldDef {
  name: string;
  kind: FieldKind;
  required?: boolean;
  help?: string;
}

export type FieldValue = string | number | boolean | null;
export type Snapshot = Record<string, FieldValue>;

export interface EntityType {
  id: string;
  world_id: string;
  owner_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  fields: FieldDef[];
  created_at: string;
  updated_at: string;
}

export interface EntityVersion {
  id: string;
  entity_id: string;
  world_id: string;
  owner_id: string;
  valid_from_rank: string;
  snapshot: Snapshot;
  source_note_id: string | null;
  source_event_id: string | null;
  note_excerpt: string | null;
  created_at: string;
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

export interface EntityIllustration {
  id: string;
  entity_id: string;
  world_id: string;
  owner_id: string;
  storage_path: string;
  caption: string | null;
  alt_text: string | null;
  mime_type: string;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

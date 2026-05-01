import { supabase } from '@/lib/supabase';

export type PromotionTargetKind =
  | 'entity'
  | 'entity_version'
  | 'chapter'
  | 'event'
  | 'note_split';

export interface LogPromotionInput {
  noteId: string;
  ownerId: string;
  targetKind: PromotionTargetKind;
  targetId: string;
  sourceExcerpt?: string | null;
  threadId?: string | null;
}

/** Fire-and-forget audit log. Errors logged to console. */
export async function logNotePromotion(input: LogPromotionInput): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('note_promotions')
      .insert({
        note_id: input.noteId,
        owner_id: input.ownerId,
        target_kind: input.targetKind,
        target_id: input.targetId,
        source_excerpt: input.sourceExcerpt ?? null,
        thread_id: input.threadId ?? null,
        created_by: input.ownerId,
      })
      .select('id')
      .single();
    if (error) {
      console.warn('[note_promotions] log failed:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn('[note_promotions] log threw:', err);
    return null;
  }
}

export type ContextLevel = 'raw' | 'L' | 'M' | 'S';

export const DEFAULT_PCC: ContextLevel[] = ['raw', 'L', 'M', 'S', 'S', 'S'];

export interface World {
  id: string;
  name: string;
  description: string | null;
  world_memory: string | null;
  custom_prompt: string | null;
  previous_chapter_context: ContextLevel[];
  created_at: string;
}

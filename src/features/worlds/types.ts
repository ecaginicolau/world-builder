export interface World {
  id: string;
  name: string;
  description: string | null;
  world_memory: string | null;
  custom_prompt: string | null;
  created_at: string;
}

// Shared PCC (Previous Chapter Context) resolver. Used by the get_pcc read
// tool and by the upscale_chapter intent. Mirrors the world's
// `previous_chapter_context` config: pccConfig[0] is the level for the
// chapter immediately before, pccConfig[1] for two before, and so on.

import type { SupabaseClient } from "@supabase/supabase-js";

export type PccLevel = "raw" | "L" | "M" | "S";

export interface PccSlotResolved {
  chapter_id: string;
  chapter_title: string | null;
  level: PccLevel;
  text: string | null;
}

export interface BuildPccResult {
  ok: true;
  slots: PccSlotResolved[];
}
export interface BuildPccError {
  ok: false;
  error: string;
}

export async function buildPcc(
  supabase: SupabaseClient,
  ownerId: string,
  chapterId: string,
): Promise<BuildPccResult | BuildPccError> {
  const cRes = await supabase
    .from("chapters")
    .select("id, world_id, part_id, reading_rank")
    .eq("id", chapterId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (cRes.error) return { ok: false, error: cRes.error.message };
  if (!cRes.data) return { ok: false, error: "Chapter not found" };

  const wRes = await supabase
    .from("worlds")
    .select("previous_chapter_context")
    .eq("id", cRes.data.world_id)
    .maybeSingle();
  if (wRes.error) return { ok: false, error: wRes.error.message };
  const pccConfig = (wRes.data?.previous_chapter_context ?? []) as PccLevel[];
  if (pccConfig.length === 0) return { ok: true, slots: [] };

  const chRes = await supabase
    .from("chapters")
    .select(
      "id, title, part_id, reading_rank, final_version_id, summary_s, summary_m, summary_l",
    )
    .eq("world_id", cRes.data.world_id)
    .eq("owner_id", ownerId);
  if (chRes.error) return { ok: false, error: chRes.error.message };

  const partsRes = await supabase
    .from("parts")
    .select("id, book_id, rank")
    .eq("world_id", cRes.data.world_id)
    .eq("owner_id", ownerId);
  if (partsRes.error) return { ok: false, error: partsRes.error.message };

  const booksRes = await supabase
    .from("books")
    .select("id, rank")
    .eq("world_id", cRes.data.world_id)
    .eq("owner_id", ownerId);
  if (booksRes.error) return { ok: false, error: booksRes.error.message };

  const partRank = new Map<string, string>();
  const partBook = new Map<string, string>();
  for (const p of (partsRes.data ?? []) as Array<{
    id: string;
    book_id: string;
    rank: string;
  }>) {
    partRank.set(p.id, p.rank);
    partBook.set(p.id, p.book_id);
  }
  const bookRank = new Map<string, string>();
  for (const b of (booksRes.data ?? []) as Array<{ id: string; rank: string }>) {
    bookRank.set(b.id, b.rank);
  }
  type ChapterRow = {
    id: string;
    title: string | null;
    part_id: string;
    reading_rank: string;
    final_version_id: string | null;
    summary_s: string | null;
    summary_m: string | null;
    summary_l: string | null;
  };
  const chapters = (chRes.data ?? []) as ChapterRow[];
  const sorted = chapters.slice().sort((a, b) => {
    const ba = bookRank.get(partBook.get(a.part_id) ?? "") ?? "";
    const bb = bookRank.get(partBook.get(b.part_id) ?? "") ?? "";
    if (ba !== bb) return ba < bb ? -1 : 1;
    const pa = partRank.get(a.part_id) ?? "";
    const pb = partRank.get(b.part_id) ?? "";
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a.reading_rank < b.reading_rank
      ? -1
      : a.reading_rank > b.reading_rank
        ? 1
        : 0;
  });
  const idx = sorted.findIndex((c) => c.id === chapterId);
  if (idx === -1) return { ok: true, slots: [] };
  const priors = sorted.slice(Math.max(0, idx - pccConfig.length), idx);

  const slots: PccSlotResolved[] = [];
  for (let i = 0; i < priors.length; i++) {
    const prior = priors[priors.length - 1 - i];
    const level = pccConfig[i];
    let text: string | null = null;
    if (level === "raw" && prior.final_version_id) {
      const fvRes = await supabase
        .from("chapter_versions")
        .select("text")
        .eq("id", prior.final_version_id)
        .maybeSingle();
      text = (fvRes.data?.text ?? null) as string | null;
    } else if (level === "L") {
      text = prior.summary_l;
    } else if (level === "M") {
      text = prior.summary_m;
    } else if (level === "S") {
      text = prior.summary_s;
    }
    slots.push({
      chapter_id: prior.id,
      chapter_title: prior.title,
      level,
      text,
    });
  }
  return { ok: true, slots };
}

const LABEL: Record<PccLevel, string> = {
  raw: "full text",
  L: "long summary",
  M: "medium summary",
  S: "short summary",
};

/** Format the resolved slots as a markdown block to inject into prompts. */
export function formatPccBlock(slots: PccSlotResolved[]): string {
  const usable = slots.filter((s) => s.text && s.text.trim().length > 0);
  if (usable.length === 0) return "";
  // PCC config[0] = chapter immediately before; oldest goes first in the prompt.
  const sections = usable
    .slice()
    .reverse()
    .map((slot) => {
      const title = slot.chapter_title?.trim() || "Untitled chapter";
      return `## "${title}" — ${LABEL[slot.level]}\n\n${slot.text!.trim()}`;
    });
  return `# Previous chapters (chronological order, oldest → newest)\n\n${sections.join("\n\n")}`;
}

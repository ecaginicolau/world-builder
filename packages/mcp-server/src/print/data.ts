import type { ServerContext } from '../context.js';

export async function owned(ctx: ServerContext, table: string, id: string) {
  const { data, error } = await ctx.supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .eq('owner_id', ctx.ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${table}: not found or not owned`);
  return data;
}

export async function allRows<T>(
  fetch: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await fetch(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export interface Chapter {
  id: string;
  world_id: string;
  part_id: string | null;
  book_id: string | null;
  is_preface: boolean;
  title: string | null;
  reading_rank: string;
  final_version_id: string | null;
  updated_at: string;
  opening_illustration_id: string | null;
  chapter_header: string | null;
  chapter_footer: string | null;
  text: string;
  version_updated_at: string | null;
  chapter_number_override?: number;
}
export async function bookData(ctx: ServerContext, bookId: string) {
  const book = await owned(ctx, 'books', bookId);
  const parts = await allRows<{ id: string; title: string | null; rank: string }>((from, to) =>
    ctx.supabase
      .from('parts')
      .select('id,title,rank')
      .eq('book_id', bookId)
      .eq('owner_id', ctx.ownerId)
      .order('rank')
      .order('id')
      .range(from, to),
  );
  const partIds = new Set(parts.map((p) => p.id));
  const rows = await allRows<Chapter>((from, to) =>
    ctx.supabase
      .from('chapters')
      .select('*')
      .eq('world_id', book.world_id)
      .eq('owner_id', ctx.ownerId)
      .order('id')
      .range(from, to),
  );
  const chapters = rows.filter(
    (c) => (c.part_id && partIds.has(c.part_id)) || (c.is_preface && c.book_id === bookId),
  );
  const ids = chapters.flatMap((c) => (c.final_version_id ? [c.final_version_id] : []));
  const versions = new Map<string, { text: string; updated_at: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await ctx.supabase
      .from('chapter_versions')
      .select('id,chapter_id,text,updated_at')
      .in('id', ids.slice(i, i + 200))
      .eq('owner_id', ctx.ownerId);
    if (error) throw new Error(error.message);
    for (const v of data ?? []) {
      if (chapters.some((c) => c.id === v.chapter_id && c.final_version_id === v.id))
        versions.set(v.id, v);
    }
  }
  for (const c of chapters) {
    const v = c.final_version_id ? versions.get(c.final_version_id) : null;
    c.text = v?.text ?? '';
    c.version_updated_at = v?.updated_at ?? null;
  }
  const exportParts = parts.map((p) => ({
    ...p,
    chapters: chapters
      .filter((c) => c.part_id === p.id)
      .sort((a, b) =>
        a.reading_rank < b.reading_rank ? -1 : a.reading_rank > b.reading_rank ? 1 : 0,
      ),
  }));
  return {
    book,
    chapters,
    exportData: {
      title: book.title as string,
      series_title: book.series_title as string | null,
      description: book.description as string | null,
      preface: chapters.find((c) => c.is_preface) ?? null,
      parts: exportParts,
      omitTitlePage: false,
    },
  };
}

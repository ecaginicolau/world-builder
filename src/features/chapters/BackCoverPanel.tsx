import { useEffect, useMemo, useState } from 'react';
import type { Book, Chapter } from './types';
import { useChaptersByWorld, usePrefaceByBook } from '@/lib/queries/chapters';
import { usePartsByBook } from '@/lib/queries/parts';
import { fetchVersionsByIds } from '@/lib/queries/chapterVersions';
import { useUpdateBook } from '@/lib/queries/books';
import { useWorld } from '@/lib/queries/worlds';
import { useUserSettings } from '@/lib/queries/userSettings';
import { useSession } from '@/features/auth/session';
import { useConfirm } from '@/lib/useConfirm';
import { htmlToPlainText } from '@/lib/html';
import { logRun } from '@/lib/queries/runs';
import {
  getBackCoverGenerator,
  type BackCoverChapterInput,
  type BackCoverSource,
} from '@/lib/llm/backCover';

type SummaryPick = 'auto' | 'S' | 'M' | 'L' | 'text';

interface Props {
  book: Book;
}

const SOURCE_OPTIONS: { key: SummaryPick; label: string; hint: string }[] = [
  { key: 'auto',  label: 'Best summary available', hint: 'L → M → S → full text per chapter' },
  { key: 'L',     label: 'Long summaries (L)',    hint: 'Falls back to text if missing' },
  { key: 'M',     label: 'Medium summaries (M)',  hint: 'Falls back to text if missing' },
  { key: 'S',     label: 'Short summaries (S)',   hint: 'Falls back to text if missing' },
  { key: 'text',  label: 'Full chapter text',     hint: 'Large input — slower / costlier' },
];

export function BackCoverPanel({ book }: Props) {
  const session = useSession();
  const updateBook = useUpdateBook();
  const worldQ = useWorld(book.world_id);
  const settingsQ = useUserSettings();
  const worldChaptersQ = useChaptersByWorld(book.world_id);
  const partsQ = usePartsByBook(book.id);
  const prefaceQ = usePrefaceByBook(book.id);
  const confirm = useConfirm();

  const [draft, setDraft] = useState(book.back_cover ?? '');
  const [pick, setPick] = useState<SummaryPick>('auto');
  const [userPrompt, setUserPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(book.back_cover ?? '');
  }, [book.id, book.back_cover]);

  const dirty = (draft ?? '') !== (book.back_cover ?? '');

  /** Chapters belonging to this book, in reading order, preface first if present. */
  const orderedChapters: Chapter[] = useMemo(() => {
    if (!worldChaptersQ.data || !partsQ.data) return [];
    const sortedParts = partsQ.data.slice().sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const result: Chapter[] = [];
    if (prefaceQ.data) result.push(prefaceQ.data);
    for (const p of sortedParts) {
      const chs = worldChaptersQ.data
        .filter((c) => c.part_id === p.id)
        .sort((a, b) => (a.reading_rank < b.reading_rank ? -1 : 1));
      result.push(...chs);
    }
    return result;
  }, [worldChaptersQ.data, partsQ.data, prefaceQ.data]);

  function pickChapterBody(c: Chapter, mode: SummaryPick): { body: string; source: BackCoverSource } {
    const ladder: ('L' | 'M' | 'S')[] =
      mode === 'auto' ? ['L', 'M', 'S']
      : mode === 'L' ? ['L', 'M', 'S']
      : mode === 'M' ? ['M', 'L', 'S']
      : mode === 'S' ? ['S', 'M', 'L']
      : [];
    for (const k of ladder) {
      const v = k === 'L' ? c.summary_l : k === 'M' ? c.summary_m : c.summary_s;
      if (v && v.trim()) return { body: v.trim(), source: 'summary' };
    }
    return { body: '', source: 'text' };
  }

  async function onGenerate() {
    if (session.status !== 'authed') return;
    if (orderedChapters.length === 0) {
      setError('This book has no chapters yet.');
      return;
    }
    if (draft.trim()) {
      const ok = await confirm({
        title: 'Replace existing back cover?',
        message: 'Generating will overwrite the textarea (you can still edit before saving).',
        confirmLabel: 'Generate',
      });
      if (!ok) return;
    }
    setError(null);
    setGenerating(true);
    try {
      // Build chapter inputs. If any chapter needs the text path, we fetch
      // final versions in one round-trip.
      const needFinalText: Chapter[] = [];
      const interim = orderedChapters.map((c) => {
        const { body, source } = pickChapterBody(c, pick);
        if (pick === 'text' || (source === 'text' && pick === 'auto')) {
          needFinalText.push(c);
          return { chapter: c, summary: '', source: 'text' as BackCoverSource };
        }
        return { chapter: c, summary: body, source };
      });

      let versionTextById = new Map<string, string>();
      if (needFinalText.length > 0) {
        const ids = needFinalText
          .map((c) => c.final_version_id)
          .filter((x): x is string => !!x);
        const versions = await fetchVersionsByIds(ids);
        versionTextById = new Map(versions.map((v) => [v.id, v.text]));
      }

      // Determine the dominant source. If user explicitly picked 'text',
      // honor it; otherwise prefer 'summary' when most chapters have one.
      const usingText =
        pick === 'text' ||
        interim.every((i) => i.source === 'text');
      const source: BackCoverSource = usingText ? 'text' : 'summary';

      const chapters: BackCoverChapterInput[] = interim.map((i) => {
        const text =
          i.chapter.final_version_id
            ? htmlToPlainText(versionTextById.get(i.chapter.final_version_id) ?? '')
            : '';
        // Truncate full text to keep token usage bounded.
        const truncated = text.length > 6000 ? text.slice(0, 6000) + ' …' : text;
        return {
          title: i.chapter.title,
          summary: i.summary,
          text: truncated,
        };
      });

      const generator = getBackCoverGenerator(settingsQ.data);
      const startedAt = Date.now();
      const result = await generator({
        worldMemory: worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined,
        worldCustomPrompt: worldQ.data?.custom_prompt ?? undefined,
        bookTitle: book.title,
        bookDescription: book.description,
        userPrompt: userPrompt.trim() || undefined,
        chapters,
        source,
        tier: settingsQ.data?.upscaleTier,
      });
      void logRun({
        ownerId: session.session.user.id,
        worldId: book.world_id,
        kind: 'back_cover',
        parentKind: null,
        parentId: book.id,
        provider: result.provider,
        model: result.model,
        status: 'success',
        durationMs: Date.now() - startedAt,
        usage: result.tokensUsed,
        inputSummary: {
          chapterCount: chapters.length,
          source,
          pick,
          promptLength: userPrompt.length,
        },
      });
      setDraft(result.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function onSave() {
    const trimmed = draft.trim();
    await updateBook.mutateAsync({
      id: book.id,
      backCover: trimmed === '' ? null : trimmed,
    });
  }

  return (
    <section className="rounded-md border border-border bg-bg-panel" data-testid="back-cover-panel">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Back cover</span>
        <span className="text-xs text-fg-muted">
          Persuasive synopsis for the printed book (120–200 words).
        </span>
      </header>

      <div className="space-y-3 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          placeholder="Write the back-cover synopsis here, or generate it from chapter content below."
          className="w-full px-3 py-2 text-sm"
          data-testid="back-cover-textarea"
        />

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-fg-muted">Source</span>
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value as SummaryPick)}
              disabled={generating}
              className="bg-bg-subtle px-2 py-1 text-sm"
              data-testid="back-cover-source-select"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-fg-muted">
              {SOURCE_OPTIONS.find((o) => o.key === pick)?.hint}
            </span>
          </label>

          <label className="flex flex-1 flex-col gap-1 text-xs">
            <span className="text-fg-muted">Author guidance (optional)</span>
            <input
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              disabled={generating}
              placeholder='e.g. "emphasize the rivalry between the twins" or "PG-13 tone, no spoilers past chapter 3"'
              className="px-2 py-1 text-sm"
              data-testid="back-cover-prompt"
            />
          </label>
        </div>

        {error ? (
          <p className="text-xs text-red-400" data-testid="back-cover-error">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">
            {orderedChapters.length} chapter{orderedChapters.length === 1 ? '' : 's'} in this book.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={generating || orderedChapters.length === 0}
              className="bg-bg-subtle px-3 py-1.5 text-sm hover:bg-bg disabled:opacity-50"
              data-testid="back-cover-generate"
            >
              {generating ? '⟳ Generating…' : draft.trim() ? 'Regenerate' : 'Generate'}
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!dirty || updateBook.isPending}
              className="bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
              data-testid="back-cover-save"
            >
              {updateBook.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

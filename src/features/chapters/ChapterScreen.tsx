import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  useChapter,
  useChaptersByWorld,
  useDeleteChapter,
  useUpdateChapter,
} from '@/lib/queries/chapters';
import {
  useChapterVersions,
  useCreateChapterVersion,
  useUpdateChapterVersionText,
} from '@/lib/queries/chapterVersions';
import { useBooks } from '@/lib/queries/books';
import { useBookEditions } from '@/lib/queries/bookEditions';
import { usePartsByWorld } from '@/lib/queries/parts';
import { fetchVersionsByIds } from '@/lib/queries/chapterVersions';
import { PdfPreviewModal } from './PdfPreviewModal';
import { useWorld } from '@/lib/queries/worlds';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useChapterParticipants } from '@/lib/queries/chapterParticipants';
import { useEvents } from '@/lib/queries/events';
import { useChapterEvents, useChapterEventsByWorld } from '@/lib/queries/chapterEvents';
import { useUserSettings } from '@/lib/queries/userSettings';
import { useSession } from '@/features/auth/session';
import { htmlToPlainText } from '@/lib/html';
import { countWords, formatWordCount } from '@/lib/wordCount';
import { resolveColor } from '@/lib/entityColors';
import {
  CURRENT_RANK_SENTINEL,
  resolveSnapshotMapAtRank,
  formatFieldValue,
} from '@/features/entities/versioning';
import { buildChapterChronoMap } from '@/features/timeline/chronoDerive';
import { NoteEditor, type NoteEditorHandle } from '@/features/notes/NoteEditor';
import { ChatPanel } from '@/features/notes/ChatPanel';
import { LinkedEntitiesPanel } from '@/features/notes/NoteEntitiesPanel';
import { DetectedEntitiesPanel } from '@/features/notes/DetectedEntitiesPanel';
import { useAutoExtract } from '@/features/notes/useAutoExtract';
import { useChapterLinkSource } from '@/features/notes/linkSources';
import { VersionsPanel } from './VersionsPanel';
import { ProposeUpdatesModal } from './ProposeUpdatesModal';
import { SummaryPanel } from './SummaryPanel';
import { EventsCoveredPanel } from './EventsCoveredPanel';
import { formatPccBlock, resolvePreviousChapters } from './pcc';
import { getUpscaler, type UpscaleEntityCard } from '@/lib/llm/upscale';
import { getSummarizer, type SummaryLength } from '@/lib/llm/summaries';
import type { ChapterVersion } from './types';
import { logRun } from '@/lib/queries/runs';
import { supabase } from '@/lib/supabase';
import type { EntityHighlightSpec } from '@/features/notes/entityHighlightExtension';
import type { TaggedEntity } from '@/lib/llm';
import type { EntityVersion, FieldDef } from '@/features/entities/types';
import { useConfirm } from '@/lib/useConfirm';
import { ReaderFeedbackPanel } from './ReaderFeedbackPanel';
import { InsertIllustrationButton } from './InsertIllustrationButton';
import { IllustrationPicker } from './IllustrationPicker';
import { illustrationSequence } from '@/lib/illustrationHydration';
import { useIllustration, publicUrlFor } from '@/lib/queries/illustrations';
import { useReaderAnnotationsByChapter } from '@/lib/queries/readerAnnotations';
import { findAnchor } from '@/features/publicReader/anchorAnnotations';
import { htmlToPlaintext } from '@/features/publicReader/renderAnnotatedHtml';

type RightTab = 'versions' | 'summary' | 'chat' | 'feedback';

export function ChapterScreen() {
  const { worldId, chapterId } = useParams({
    from: '/worlds/$worldId/chapters/$chapterId',
  });
  const navigate = useNavigate();
  const session = useSession();
  const chapterQ = useChapter(chapterId);
  const versionsQ = useChapterVersions(chapterId);
  const worldChaptersQ = useChaptersByWorld(worldId);
  const booksQ = useBooks(worldId);
  const partsQ = usePartsByWorld(worldId);
  // Owner book of this chapter (via part for regular chapters, direct for
  // prefaces). Used by the chapter-scoped PDF preview to pick a default
  // edition. Computed lazily — `bookId` may be undefined briefly while parts
  // are loading.
  const ownerPart = partsQ.data?.find((p) => p.id === chapterQ.data?.part_id);
  const ownerBookId = chapterQ.data?.is_preface
    ? chapterQ.data.book_id
    : ownerPart?.book_id;
  const editionsQ = useBookEditions(ownerBookId ?? '');
  const worldQ = useWorld(worldId);
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const participantsQ = useChapterParticipants(chapterId);
  const eventsQ = useEvents(worldId);
  const chapterEventsQ = useChapterEvents(chapterId);
  const allChapterEventsQ = useChapterEventsByWorld(worldId);
  const settingsQ = useUserSettings();
  const feedbackQ = useReaderAnnotationsByChapter(chapterId);
  const linkSource = useChapterLinkSource(chapterId);
  const updateChapter = useUpdateChapter();
  const createVersion = useCreateChapterVersion();
  const updateVersionText = useUpdateChapterVersionText();
  const deleteChapter = useDeleteChapter();
  const confirm = useConfirm();

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('versions');
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [upscaling, setUpscaling] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [previewPdfOpen, setPreviewPdfOpen] = useState(false);
  const [summarizing, setSummarizing] = useState<SummaryLength | null>(null);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(null);
  const editorRef = useRef<NoteEditorHandle>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = window.location.hash.match(/^#ann=(.+)$/);
    if (m) {
      setRightTab('feedback');
      setFocusedAnnotationId(decodeURIComponent(m[1]));
    }
  }, [chapterId]);

  const versions = useMemo(() => versionsQ.data ?? [], [versionsQ.data]);
  const finalVersion = useMemo(
    () => versions.find((v) => v.id === chapterQ.data?.final_version_id) ?? versions[versions.length - 1] ?? null,
    [versions, chapterQ.data?.final_version_id],
  );
  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? finalVersion,
    [versions, selectedVersionId, finalVersion],
  );

  // Reading-order list of chapters across the whole world.
  // Within a book: preface (if any) → part1 chapters → part2 chapters → ...
  // Across books: ordered by book.rank.
  const orderedChapters = useMemo(() => {
    const chapters = worldChaptersQ.data ?? [];
    const partsById = new Map((partsQ.data ?? []).map((p) => [p.id, p]));
    const bookRankById = new Map((booksQ.data ?? []).map((b) => [b.id, b.rank]));
    function bookRankFor(c: typeof chapters[number]): string {
      if (c.is_preface && c.book_id) return bookRankById.get(c.book_id) ?? '';
      const p = c.part_id ? partsById.get(c.part_id) : null;
      return p ? bookRankById.get(p.book_id) ?? '' : '';
    }
    return [...chapters].sort((a, b) => {
      const baRank = bookRankFor(a);
      const bbRank = bookRankFor(b);
      if (baRank !== bbRank) return baRank < bbRank ? -1 : 1;
      // Within a book: preface always first.
      if (a.is_preface !== b.is_preface) return a.is_preface ? -1 : 1;
      const paRank = a.part_id ? partsById.get(a.part_id)?.rank ?? '' : '';
      const pbRank = b.part_id ? partsById.get(b.part_id)?.rank ?? '' : '';
      if (paRank !== pbRank) return paRank < pbRank ? -1 : 1;
      if (a.reading_rank !== b.reading_rank) return a.reading_rank < b.reading_rank ? -1 : 1;
      return 0;
    });
  }, [worldChaptersQ.data, partsQ.data, booksQ.data]);
  const currentIndex = orderedChapters.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? orderedChapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex >= 0 && currentIndex < orderedChapters.length - 1
      ? orderedChapters[currentIndex + 1]
      : null;

  // 1-based chapter number within the current book — prefaces are NOT numbered.
  const chapterNumberInBook = useMemo(() => {
    const ch = chapterQ.data;
    if (!ch || ch.is_preface) return null;
    const parts = partsQ.data ?? [];
    const partsById = new Map(parts.map((p) => [p.id, p]));
    const currentPart = ch.part_id ? partsById.get(ch.part_id) : null;
    if (!currentPart) return null;
    const sameBookIds = new Set(
      parts.filter((p) => p.book_id === currentPart.book_id).map((p) => p.id),
    );
    const inBook = orderedChapters.filter(
      (c) => !c.is_preface && c.part_id && sameBookIds.has(c.part_id),
    );
    const idx = inBook.findIndex((c) => c.id === chapterId);
    return idx >= 0 ? idx + 1 : null;
  }, [orderedChapters, partsQ.data, chapterQ.data, chapterId]);

  // Derived chronological rank for every chapter in the world (= min linked event chrono).
  const chapterChrono = useMemo(
    () => buildChapterChronoMap(allChapterEventsQ.data ?? [], eventsQ.data ?? []),
    [allChapterEventsQ.data, eventsQ.data],
  );
  const currentChrono = chapterChrono.get(chapterId);
  // Used to resolve entity cards "as the chapter sees the world" — fall back to
  // current state if the chapter has no events linked yet.
  const cardResolutionRank = currentChrono ?? CURRENT_RANK_SENTINEL;

  // Default selection = final, when versions load.
  useEffect(() => {
    if (selectedVersionId) return;
    if (finalVersion) setSelectedVersionId(finalVersion.id);
  }, [selectedVersionId, finalVersion]);

  // Reset dirty when switching to a different version.
  useEffect(() => {
    setDirty(false);
  }, [selectedVersionId]);

  const currentTitle = titleDraft ?? chapterQ.data?.title ?? '';

  // Live HTML pushed by the editor on every keystroke. Used by useAutoExtract
  // and the chat panel so the debounce starts ticking from the last keystroke,
  // not from the next save round-trip (which lags ~600ms behind).
  const [liveText, setLiveText] = useState<string | null>(null);
  useEffect(() => {
    setLiveText(null);
  }, [selectedVersion?.id]);

  const selectedTextForLlm = useMemo(() => {
    const html = liveText ?? selectedVersion?.text ?? '';
    return htmlToPlainText(html);
  }, [liveText, selectedVersion]);

  const wordCount = useMemo(
    () => (finalVersion ? countWords(finalVersion.text) : 0),
    [finalVersion],
  );

  const extract = useAutoExtract({
    parentKind: 'chapter',
    parentId: chapterId,
    worldId,
    plainText: selectedTextForLlm,
  });

  const entityHighlights = useMemo<EntityHighlightSpec[]>(() => {
    const types = typesQ.data ?? [];
    const typesById = new Map(types.map((t) => [t.id, t]));
    return (entitiesQ.data ?? []).map((e) => {
      const t = typesById.get(e.entity_type_id);
      const color = t ? resolveColor(t.color, t.name) : '#a1a1aa';
      return { name: e.name, aliases: e.aliases ?? [], color };
    });
  }, [entitiesQ.data, typesQ.data]);

  const taggedEntitiesForLlm = useMemo<TaggedEntity[]>(() => {
    const links = participantsQ.data ?? [];
    if (links.length === 0) return [];
    const typesById = new Map((typesQ.data ?? []).map((t) => [t.id, t]));
    const entitiesById = new Map((entitiesQ.data ?? []).map((e) => [e.id, e]));
    const out: TaggedEntity[] = [];
    for (const l of links) {
      const e = entitiesById.get(l.entity_id);
      if (!e) continue;
      out.push({ name: e.name, type: typesById.get(e.entity_type_id)?.name ?? 'Unknown' });
    }
    return out;
  }, [participantsQ.data, entitiesQ.data, typesQ.data]);

  function onTitleChange(value: string) {
    setTitleDraft(value);
    updateChapter.mutate({ id: chapterId, title: value || null });
  }

  async function onSelectVersion(id: string) {
    if (id === selectedVersionId) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved edits?',
        message: 'You have manual changes in the editor that haven\'t been saved as a new version.',
        danger: true,
        confirmLabel: 'Discard',
      });
      if (!ok) return;
    }
    setSelectedVersionId(id);
  }

  function onSetFinal(id: string) {
    if (id === chapterQ.data?.final_version_id) return;
    updateChapter.mutate({ id: chapterId, finalVersionId: id });
  }

  async function onSaveManualEdit() {
    if (session.status !== 'authed' || !selectedVersion) return;
    const newText = editorRef.current?.getHTML() ?? '';
    await createVersion.mutateAsync({
      chapterId,
      worldId,
      ownerId: session.session.user.id,
      origin: 'manual_edit',
      text: newText,
      parentVersionId: selectedVersion.id,
      existingVersions: versions,
    });
    setDirty(false);
  }

  // After a new version is created, auto-select & follow it (effect on versions list growth).
  const prevCountRef = useRef<number>(0);
  useEffect(() => {
    if (versions.length > prevCountRef.current) {
      const newest = versions[versions.length - 1];
      if (newest) {
        setSelectedVersionId(newest.id);
        setDirty(false);
      }
    }
    prevCountRef.current = versions.length;
  }, [versions]);

  async function onUpscale(
    userPrompt: string,
    includePcc: boolean,
    opts: { forceCloud?: boolean } = {},
  ) {
    setUpscaleError(null);
    if (upscaling) return;
    if (session.status !== 'authed' || !chapterQ.data || !finalVersion) return;
    setUpscaling(true);
    try {
      // Resolve entity cards at the chapter's derived chrono (or current state).
      const cards: UpscaleEntityCard[] = [];
      const typesById = new Map((typesQ.data ?? []).map((t) => [t.id, t]));
      for (const link of participantsQ.data ?? []) {
        const e = (entitiesQ.data ?? []).find((x) => x.id === link.entity_id);
        if (!e) continue;
        const t = typesById.get(e.entity_type_id);
        const fields: FieldDef[] = t?.fields ?? [];
        const { data: vs } = await supabase
          .from('entity_versions')
          .select('*')
          .eq('entity_id', e.id);
        const snap = resolveSnapshotMapAtRank(
          (vs ?? []) as EntityVersion[],
          cardResolutionRank,
          fields,
        );
        const snapshot: Record<string, string> = {};
        for (const f of fields) {
          snapshot[f.name] = formatFieldValue(snap[f.name] ?? null);
        }
        cards.push({ id: e.id, name: e.name, type: t?.name ?? 'Unknown', snapshot });
      }
      // Resolve PCC slots if requested.
      const pccSlots = await buildPccSlots({
        includePcc,
        worldId,
        currentChapterId: chapterId,
        chapterChrono,
        allChapters: worldChaptersQ.data ?? [],
        configuredSlots: worldQ.data?.previous_chapter_context ?? [],
      });
      const upscale = getUpscaler(settingsQ.data, { forceCloud: opts.forceCloud });
      const startedAt = Date.now();
      const result = await upscale({
        worldMemory: worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined,
        worldCustomPrompt: worldQ.data?.custom_prompt ?? undefined,
        chapterTitle: chapterQ.data.title ?? undefined,
        currentText: htmlToPlainText(finalVersion.text),
        userPrompt,
        entityCards: cards,
        previousChapters: pccSlots,
        tier: settingsQ.data?.upscaleTier,
      });
      const runId = await logRun({
        ownerId: session.session.user.id,
        worldId,
        kind: 'upscale',
        parentKind: 'chapter',
        parentId: chapterId,
        provider: result.provider,
        model: result.model,
        status: 'success',
        durationMs: Date.now() - startedAt,
        usage: result.tokensUsed,
        inputSummary: { entityCount: cards.length, promptLength: userPrompt.length },
      });
      const text = result.text
        .split(/\n{2,}/)
        .map((para) => `<p>${escapeHtml(para.trim())}</p>`)
        .join('');
      await createVersion.mutateAsync({
        chapterId,
        worldId,
        ownerId: session.session.user.id,
        origin: 'upscale',
        text,
        parentVersionId: finalVersion.id,
        userPrompt,
        runId: runId ?? null,
        existingVersions: versions,
      });
    } catch (err) {
      setUpscaleError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setUpscaling(false);
    }
  }

  async function onGenerateSummary(
    len: SummaryLength,
    opts: { forceCloud?: boolean } = {},
  ) {
    setSummarizeError(null);
    if (session.status !== 'authed' || !chapterQ.data || !finalVersion) return;
    if (summarizing) return;
    setSummarizing(len);
    try {
      const summarize = getSummarizer(settingsQ.data, { forceCloud: opts.forceCloud });
      const startedAt = Date.now();
      const result = await summarize({
        worldMemory: worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined,
        worldCustomPrompt: worldQ.data?.custom_prompt ?? undefined,
        chapterTitle: chapterQ.data.title ?? undefined,
        chapterText: htmlToPlainText(finalVersion.text),
        length: len,
        tier: settingsQ.data?.summarizeTier,
      });
      void logRun({
        ownerId: session.session.user.id,
        worldId,
        kind: 'summarize',
        parentKind: 'chapter',
        parentId: chapterId,
        provider: result.provider,
        model: result.model,
        status: 'success',
        durationMs: Date.now() - startedAt,
        usage: result.tokensUsed,
        inputSummary: { length: len },
      });
      const patch: Parameters<typeof updateChapter.mutateAsync>[0] = { id: chapterId };
      if (len === 'S') patch.summaryS = result.text;
      if (len === 'M') patch.summaryM = result.text;
      if (len === 'L') patch.summaryL = result.text;
      await updateChapter.mutateAsync(patch);
    } catch (err) {
      setSummarizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummarizing(null);
    }
  }

  async function onSaveSummary(len: SummaryLength, text: string) {
    const patch: Parameters<typeof updateChapter.mutateAsync>[0] = { id: chapterId };
    const trimmed = text.trim() || null;
    if (len === 'S') patch.summaryS = trimmed;
    if (len === 'M') patch.summaryM = trimmed;
    if (len === 'L') patch.summaryL = trimmed;
    await updateChapter.mutateAsync(patch);
  }

  async function onDelete() {
    if (!chapterQ.data) return;
    const ok = await confirm({
      title: chapterQ.data.is_preface ? 'Delete this preface?' : 'Delete this chapter?',
      danger: true,
    });
    if (!ok) return;
    await deleteChapter.mutateAsync({
      id: chapterId,
      partId: chapterQ.data.part_id,
      bookId: chapterQ.data.book_id,
      worldId,
    });
    void navigate({ to: '/worlds/$worldId/books', params: { worldId } });
  }

  if (chapterQ.isLoading || !chapterQ.data || !selectedVersion) {
    return (
      <main className="mx-auto flex h-full max-w-6xl flex-col gap-4 px-6 py-6">
        <p className="text-fg-muted">Loading chapter…</p>
      </main>
    );
  }

  // Versions whose text is the user's own — we autosave in place (no new
  // row per keystroke). Upscale rows stay frozen so their LLM output remains
  // recoverable; editing them goes through "Save as new version".
  const isEditableInPlace =
    selectedVersion.origin === 'draft' || selectedVersion.origin === 'manual_edit';
  const isOnManualEdit = selectedVersion.origin === 'manual_edit';
  const isPublished = chapterQ.data.status === 'published';
  const isPreface = chapterQ.data.is_preface;
  const noEventsLinked = !isPreface && (chapterEventsQ.data ?? []).length === 0;
  const lastAnalyzedAt = chapterQ.data.last_analyzed_at;
  const finalUpdatedAt = finalVersion?.updated_at ?? finalVersion?.created_at;
  const proseChangedSinceAnalysis =
    !!lastAnalyzedAt && !!finalUpdatedAt && finalUpdatedAt > lastAnalyzedAt;

  async function onTogglePublished() {
    if (!chapterQ.data) return;
    if (!isPublished && dirty) {
      const ok = await confirm({
        title: 'Save unsaved edits before publishing?',
        message: 'You have unsaved manual edits. Save them first or discard before publishing.',
        confirmLabel: 'OK',
      });
      if (ok) return;
    }
    await updateChapter.mutateAsync({
      id: chapterQ.data.id,
      status: isPublished ? 'draft' : 'published',
    });
  }

  function onFramingDebouncedChange(field: 'chapterHeader' | 'chapterFooter', html: string) {
    if (isPublished) return;
    const current =
      field === 'chapterHeader'
        ? chapterQ.data?.chapter_header ?? null
        : chapterQ.data?.chapter_footer ?? null;
    const next = htmlToPlainText(html).trim() === '' ? null : html;
    if (next === current) return;
    updateChapter.mutate({ id: chapterId, [field]: next } as Parameters<typeof updateChapter.mutate>[0]);
  }
  function onHeaderDebouncedChange(html: string) {
    onFramingDebouncedChange('chapterHeader', html);
  }
  function onFooterDebouncedChange(html: string) {
    onFramingDebouncedChange('chapterFooter', html);
  }

  function onEditorDebouncedChange(html: string) {
    if (isPublished) return;
    // Equality check: same plaintext AND same illustration sequence (order +
    // duplicates included). The plaintext check avoids spurious saves when
    // Tiptap re-renders identical content with different tag-level diffs;
    // the illustration check catches insert/remove/reorder which produce
    // zero plaintext delta.
    if (
      selectedVersion &&
      htmlToPlainText(html) === htmlToPlainText(selectedVersion.text) &&
      illustrationSequence(html) === illustrationSequence(selectedVersion.text)
    ) {
      setDirty(false);
      return;
    }
    if (isEditableInPlace && session.status === 'authed') {
      updateVersionText.mutate({
        id: selectedVersion!.id,
        chapterId,
        text: html,
      });
      setDirty(false);
    } else {
      setDirty(true);
    }
  }

  async function onSnapshotManualEdit() {
    if (session.status !== 'authed' || !selectedVersion) return;
    // Read the editor's current HTML synchronously so a 400ms debounced
    // autosave that hasn't fired yet doesn't get truncated out.
    const text = editorRef.current?.getHTML() ?? selectedVersion.text;
    await createVersion.mutateAsync({
      chapterId,
      worldId,
      ownerId: session.session.user.id,
      origin: 'manual_edit',
      text,
      parentVersionId: selectedVersion.id,
      existingVersions: versions,
    });
  }

  return (
    <main className="mx-auto flex h-full max-w-[1800px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            to="/worlds/$worldId/books"
            params={{ worldId }}
            className="text-sm text-fg-muted hover:text-fg"
            data-testid="back-to-books"
          >
            ← Books
          </Link>
          {chapterQ.data.is_preface ? (
            <span
              className="text-sm text-fg-muted"
              data-testid="chapter-preface-label"
            >
              Preface
            </span>
          ) : chapterNumberInBook !== null ? (
            <span
              className="text-sm text-fg-muted"
              data-testid="chapter-number"
            >
              Chapter {chapterNumberInBook}
            </span>
          ) : null}
          <div className="flex items-center gap-1">
            {prevChapter ? (
              <Link
                to="/worlds/$worldId/chapters/$chapterId"
                params={{ worldId, chapterId: prevChapter.id }}
                className="bg-bg-subtle px-2 py-1 text-sm hover:bg-bg-panel"
                data-testid="prev-chapter"
                title={prevChapter.title ?? 'Untitled chapter'}
              >
                ← Prev
              </Link>
            ) : (
              <span
                className="cursor-not-allowed bg-bg-subtle px-2 py-1 text-sm opacity-40"
                data-testid="prev-chapter-disabled"
              >
                ← Prev
              </span>
            )}
            {nextChapter ? (
              <Link
                to="/worlds/$worldId/chapters/$chapterId"
                params={{ worldId, chapterId: nextChapter.id }}
                className="bg-bg-subtle px-2 py-1 text-sm hover:bg-bg-panel"
                data-testid="next-chapter"
                title={nextChapter.title ?? 'Untitled chapter'}
              >
                Next →
              </Link>
            ) : (
              <span
                className="cursor-not-allowed bg-bg-subtle px-2 py-1 text-sm opacity-40"
                data-testid="next-chapter-disabled"
              >
                Next →
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-fg-muted"
            data-testid="chapter-word-count"
            title="Word count of the final version"
          >
            {formatWordCount(wordCount)}
          </span>
          {noEventsLinked ? (
            <span
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-mono uppercase text-amber-300"
              data-testid="no-events-badge"
              title="Add at least one event in the left panel — without events this chapter is hidden from the timeline."
            >
              No events linked
            </span>
          ) : null}
          {proseChangedSinceAnalysis ? (
            <span
              className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs font-mono uppercase text-sky-300"
              data-testid="prose-changed-badge"
              title={`Prose changed since last canon analysis on ${new Date(lastAnalyzedAt!).toLocaleString()}.`}
            >
              Prose changed
            </span>
          ) : null}
          {isPublished ? (
            <span
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-mono uppercase text-emerald-300"
              data-testid="published-badge"
              title={`Published ${chapterQ.data.published_at ? new Date(chapterQ.data.published_at).toLocaleString() : ''}`}
            >
              Published
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void onTogglePublished()}
            className={
              isPublished
                ? 'bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel'
                : 'bg-emerald-600/80 px-3 py-1 text-sm font-medium text-emerald-50 hover:bg-emerald-600'
            }
            data-testid="publish-toggle"
          >
            {isPublished ? 'Unpublish' : 'Publish'}
          </button>
          {isPreface ? null : (
            <button
              type="button"
              onClick={() => setProposeOpen(true)}
              disabled={isPublished}
              className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel disabled:cursor-not-allowed disabled:opacity-50"
              title={isPublished ? 'Unpublish to propose canon' : undefined}
              data-testid="propose-canon"
            >
              Propose canon
            </button>
          )}
          <button
            type="button"
            onClick={() => setPreviewPdfOpen(true)}
            className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel"
            title="Render this chapter (with its neighbours for context) as PDF"
            data-testid="preview-chapter-pdf"
          >
            Preview PDF
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-sm text-fg-muted hover:text-red-400"
            data-testid="delete-chapter"
          >
            Delete
          </button>
        </div>
      </header>

      <input
        type="text"
        value={currentTitle}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Untitled chapter"
        readOnly={isPublished}
        className="bg-transparent px-1 py-2 text-2xl font-semibold tracking-tight focus:outline-none"
        data-testid="chapter-title"
      />

      <div className="grid min-h-0 flex-1 gap-4 grid-cols-1 md:grid-cols-[260px_1fr_540px]">
        <aside className="order-2 flex min-h-0 flex-col gap-4 overflow-y-auto md:order-1">
          {/* Layout-only controls stay available even when published. They
              don't change the canonical text — just framing/illustrations. */}
          <InsertIllustrationButton
            worldId={worldId}
            chapterId={chapterId}
            onPick={(illustrationId, entityId) =>
              editorRef.current?.insertIllustration(illustrationId, entityId)
            }
          />
          <button
            type="button"
            onClick={() => editorRef.current?.insertPageBreak()}
            className="rounded border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-fg-muted hover:text-fg"
            data-testid="insert-page-break-btn"
            title="Insert a manual page break (PDF export only)"
          >
            + Page break
          </button>
          <FullPagePicker
            worldId={worldId}
            chapterId={chapterId}
            onPick={(illId, entId) =>
              editorRef.current?.insertFullPageIllustration(illId, entId)
            }
          />
          <OpeningIllustrationControl
            chapterId={chapterId}
            worldId={worldId}
            openingIllustrationId={chapterQ.data?.opening_illustration_id ?? null}
            disabled={false}
          />
          {isPreface ? (
            <p className="px-2 text-xs italic text-fg-muted">
              Preface — not on the canonical timeline. No events, no entity tagging.
            </p>
          ) : (
            <>
              <EventsCoveredPanel worldId={worldId} chapterId={chapterId} />
              <LinkedEntitiesPanel worldId={worldId} source={linkSource} />
              <DetectedEntitiesPanel
                worldId={worldId}
                candidates={extract.candidates}
                status={extract.status}
                error={extract.error}
                source={linkSource}
              />
            </>
          )}
        </aside>

        <div ref={editorContainerRef} className="order-1 relative min-h-0 overflow-y-auto md:order-2 flex flex-col gap-2">
          {/* Chapter header / footer are framing (epigraphs, monolog),
              stored on the chapter row, not in chapter_versions. Always
              editable — published-status is about narrative content only. */}
          <NoteEditor
            key={`header-${chapterId}`}
            initialContent={chapterQ.data.chapter_header ?? ''}
            onChange={onHeaderDebouncedChange}
            placeholder="Optional header (epigraph, accroche…) — empty = nothing rendered"
            minHeightClass="min-h-[3.5rem]"
            testId="chapter-header-editor"
          />
          <NoteEditor
            ref={editorRef}
            key={selectedVersion.id}
            initialContent={selectedVersion.text}
            onChange={onEditorDebouncedChange}
            onLiveUpdate={setLiveText}
            entityHighlights={entityHighlights}
            readOnly={isPublished}
            enableIllustrations
            enablePageBreaks
          />
          <NoteEditor
            key={`footer-${chapterId}`}
            initialContent={chapterQ.data.chapter_footer ?? ''}
            onChange={onFooterDebouncedChange}
            placeholder="Optional footer (closing line, tag…) — empty = nothing rendered"
            minHeightClass="min-h-[3.5rem]"
            testId="chapter-footer-editor"
          />
          {feedbackQ.data && feedbackQ.data.length > 0 && finalVersion ? (
            <FeedbackMarginDots
              containerRef={editorContainerRef}
              annotations={feedbackQ.data}
              chapterText={finalVersion.text}
              focusedId={focusedAnnotationId}
              onClick={(id) => {
                setRightTab('feedback');
                setFocusedAnnotationId(id);
              }}
            />
          ) : null}
        </div>

        <div className="order-3 flex min-h-0 flex-col gap-2">
          <div className="flex gap-1" data-testid="right-tabs">
            <button
              type="button"
              onClick={() => setRightTab('versions')}
              className={
                'flex-1 px-2 py-1 text-sm ' +
                (rightTab === 'versions' ? 'bg-accent text-accent-fg' : 'bg-bg-subtle hover:bg-bg-panel')
              }
              data-testid="tab-versions"
            >
              Versions ⚡
            </button>
            <button
              type="button"
              onClick={() => setRightTab('summary')}
              className={
                'flex-1 px-2 py-1 text-sm ' +
                (rightTab === 'summary' ? 'bg-accent text-accent-fg' : 'bg-bg-subtle hover:bg-bg-panel')
              }
              data-testid="tab-summary"
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setRightTab('chat')}
              className={
                'flex-1 px-2 py-1 text-sm ' +
                (rightTab === 'chat' ? 'bg-accent text-accent-fg' : 'bg-bg-subtle hover:bg-bg-panel')
              }
              data-testid="tab-chat"
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setRightTab('feedback')}
              className={
                'flex-1 px-2 py-1 text-sm ' +
                (rightTab === 'feedback' ? 'bg-accent text-accent-fg' : 'bg-bg-subtle hover:bg-bg-panel')
              }
              data-testid="tab-feedback"
            >
              Feedback{feedbackQ.data && feedbackQ.data.length > 0 ? ` (${feedbackQ.data.length})` : ''}
            </button>
          </div>
          <div className="flex min-h-0 flex-1">
            {rightTab === 'versions' ? (
              <div className="min-w-0 flex-1">
                <VersionsPanel
                  versions={versions}
                  selectedId={selectedVersion.id}
                  finalId={chapterQ.data.final_version_id}
                  onSelect={(id) => void onSelectVersion(id)}
                  onSetFinal={onSetFinal}
                  onUpscale={onUpscale}
                  upscalePending={upscaling}
                  upscaleError={upscaleError}
                  localUpscaleActive={
                    !!settingsQ.data?.localLlmEnabled &&
                    !!settingsQ.data?.upscaleLocalModel
                  }
                  dirty={dirty && !isEditableInPlace}
                  onSaveManualEdit={onSaveManualEdit}
                  saveManualPending={createVersion.isPending}
                  showSnapshotButton={isOnManualEdit}
                  onSnapshot={() => void onSnapshotManualEdit()}
                  snapshotPending={createVersion.isPending}
                  pccSlotCount={worldQ.data?.previous_chapter_context.length ?? 0}
                  readOnly={isPublished}
                />
              </div>
            ) : rightTab === 'summary' ? (
              <div className="min-w-0 flex-1">
                <SummaryPanel
                  chapter={chapterQ.data}
                  finalText={finalVersion ? htmlToPlainText(finalVersion.text) : ''}
                  generating={summarizing}
                  generateError={summarizeError}
                  onGenerate={onGenerateSummary}
                  onSave={onSaveSummary}
                  savePending={updateChapter.isPending}
                  readOnly={isPublished}
                  localSummariesActive={
                    !!settingsQ.data?.localLlmEnabled &&
                    !!settingsQ.data?.summariesLocalModel
                  }
                />
              </div>
            ) : rightTab === 'chat' ? (
              <div className="min-w-0 flex-1">
                <ChatPanel
                  parentKind="chapter"
                  parentId={chapterId}
                  worldId={worldId}
                  worldMemory={worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined}
                  worldCustomPrompt={worldQ.data?.custom_prompt ?? undefined}
                  noteTitle={currentTitle || undefined}
                  noteContextText={selectedTextForLlm}
                  taggedEntities={taggedEntitiesForLlm}
                  pccSlotCount={worldQ.data?.previous_chapter_context.length ?? 0}
                  buildPccBlock={async () => {
                    if (!chapterQ.data) return '';
                    const slots = await buildPccSlots({
                      includePcc: true,
                      worldId,
                      currentChapterId: chapterId,
                      chapterChrono,
                      allChapters: worldChaptersQ.data ?? [],
                      configuredSlots: worldQ.data?.previous_chapter_context ?? [],
                    });
                    return formatPccBlock(slots);
                  }}
                />
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                {chapterQ.data && partsQ.data ? (
                  <ReaderFeedbackPanel
                    chapterId={chapterId}
                    bookId={
                      chapterQ.data.book_id ??
                      partsQ.data.find((p) => p.id === chapterQ.data!.part_id)?.book_id ??
                      ''
                    }
                    focusAnnotationId={focusedAnnotationId}
                    onFocus={(id) => setFocusedAnnotationId(id)}
                  />
                ) : (
                  <p className="px-3 py-3 text-sm text-fg-muted">Loading…</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ProposeUpdatesModal
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
        worldId={worldId}
        chapterId={chapterId}
        chapterText={finalVersion?.text ?? ''}
      />

      {previewPdfOpen ? (
        <ChapterPdfPreview
          chapter={chapterQ.data}
          ownerPart={ownerPart}
          edition={editionsQ.data?.[0]}
          chapterNumber={chapterNumberInBook}
          onClose={() => setPreviewPdfOpen(false)}
        />
      ) : null}
    </main>
  );
}

function ChapterPdfPreview({
  chapter,
  ownerPart,
  edition,
  chapterNumber,
  onClose,
}: {
  chapter: import('./types').Chapter | undefined;
  ownerPart: import('./types').Part | undefined;
  edition: import('./types').BookEdition | undefined;
  chapterNumber: number | null;
  onClose: () => void;
}) {
  // Stabilize the build callback so PdfPreviewModal's effect doesn't cancel
  // and restart on every parent re-render. Recomputes only when the chapter
  // (incl. its frontispiece / framing / final_version_id), the owning part,
  // or the edition actually change. Without this, an unrelated parent re-
  // render (e.g. a sibling query refetch) would invalidate the in-flight PDF
  // build and the user could see a stale or wrong-chapter blob lingering.
  const buildBlob = useCallback(async () => {
    if (!chapter || !edition) {
      throw new Error('Chapter or edition not ready yet');
    }
    const finalIds = chapter.final_version_id ? [chapter.final_version_id] : [];
    const versions = await fetchVersionsByIds(finalIds);
    const versionText = new Map(versions.map((v) => [v.id, v.text]));
    const exportData = {
      title: chapter.title ?? 'Chapter preview',
      description: null,
      preface: null,
      // Skip the cover-like title page — the user is iterating on layout,
      // not the book cover. Single part means part page is auto-omitted.
      omitTitlePage: true,
      parts: [
        {
          id: ownerPart?.id ?? 'preview',
          title: ownerPart?.title ?? null,
          rank: ownerPart?.rank ?? 'a',
          chapters: [
            {
              id: chapter.id,
              title: chapter.title,
              reading_rank: chapter.reading_rank,
              text: chapter.final_version_id
                ? (versionText.get(chapter.final_version_id) ?? '')
                : '',
              chapter_header: chapter.chapter_header,
              chapter_footer: chapter.chapter_footer,
              opening_illustration_id: chapter.opening_illustration_id,
              chapter_number_override: chapterNumber ?? null,
            },
          ],
        },
      ],
    };
    const { buildBookPdfBlob } = await import('./bookPdfExport');
    return buildBookPdfBlob(exportData, edition);
  }, [chapter, ownerPart, edition, chapterNumber]);

  if (!chapter) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <div className="rounded-md bg-bg-panel p-6 text-sm text-fg-muted">
          Loading chapter…
        </div>
      </div>
    );
  }
  if (!edition) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <div className="max-w-md rounded-md bg-bg-panel p-6 text-sm text-fg-muted">
          <p className="mb-3">
            No print edition exists for this book yet. Create one on the book
            detail screen first (Print editions panel → + New edition), then
            come back here to preview.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1 text-xs hover:border-fg-muted hover:text-fg"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <PdfPreviewModal
      title={`${chapter.title ?? '(untitled)'} — ${edition.name}`}
      onClose={onClose}
      buildBlob={buildBlob}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function buildPccSlots(args: {
  includePcc: boolean;
  worldId: string;
  currentChapterId: string;
  chapterChrono: Map<string, string>;
  allChapters: import('./types').Chapter[];
  configuredSlots: import('@/features/worlds/types').ContextLevel[];
}) {
  const { includePcc, worldId, currentChapterId, chapterChrono, allChapters, configuredSlots } = args;
  if (!includePcc || configuredSlots.length === 0) return [];
  const currentChrono = chapterChrono.get(currentChapterId);
  if (currentChrono === undefined) return [];

  // Pick the eligible earlier chapters (mirroring resolvePreviousChapters' logic
  // so we only fetch the final-version texts we may need).
  const earlier = allChapters
    .map((c) => ({ chapter: c, chrono: chapterChrono.get(c.id) }))
    .filter((x): x is { chapter: import('./types').Chapter; chrono: string } =>
      x.chapter.id !== currentChapterId && x.chrono !== undefined && x.chrono < currentChrono,
    )
    .sort((a, b) => (a.chrono < b.chrono ? 1 : a.chrono > b.chrono ? -1 : 0))
    .map((x) => x.chapter)
    .slice(0, configuredSlots.length);
  if (earlier.length === 0) return [];

  const finalIds = earlier
    .map((c) => c.final_version_id)
    .filter((id): id is string => !!id);
  const versionsById = new Map<string, ChapterVersion | null>();
  if (finalIds.length > 0) {
    const { data, error } = await supabase
      .from('chapter_versions')
      .select('*')
      .in('id', finalIds)
      .eq('world_id', worldId);
    if (error) throw error;
    for (const v of (data ?? []) as ChapterVersion[]) {
      versionsById.set(v.chapter_id, v);
    }
  }

  // Find current chapter object to satisfy resolvePreviousChapters' API.
  const current = allChapters.find((c) => c.id === currentChapterId);
  if (!current) return [];

  return resolvePreviousChapters({
    current,
    allChapters,
    chapterChrono,
    finalVersionByChapter: versionsById,
    slots: configuredSlots,
  });
}

interface MarginDotsProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  annotations: { id: string; kind: 'up' | 'down' | 'comment'; selected_text: string; before_ctx: string; after_ctx: string }[];
  chapterText: string;
  focusedId: string | null;
  onClick: (id: string) => void;
}

function FeedbackMarginDots({ containerRef, annotations, chapterText, focusedId, onClick }: MarginDotsProps) {
  const [dots, setDots] = useState<{ id: string; kind: 'up' | 'down' | 'comment'; top: number }[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const compute = () => {
      const plain = htmlToPlaintext(chapterText);
      const proseEl = container.querySelector('.ProseMirror[data-testid="note-editor"]') as HTMLElement | null;
      if (!proseEl) {
        setDots([]);
        return;
      }
      const containerRect = container.getBoundingClientRect();

      const out: { id: string; kind: 'up' | 'down' | 'comment'; top: number }[] = [];
      for (const ann of annotations) {
        const range = findAnchor(plain, ann);
        if (!range) continue;
        const domRange = createDomRange(proseEl, range.start, range.end);
        if (!domRange) continue;
        const rect = domRange.getBoundingClientRect();
        if (rect.height === 0) continue;
        const top = rect.top - containerRect.top + container.scrollTop;
        out.push({ id: ann.id, kind: ann.kind, top });
      }
      setDots(out);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    container.addEventListener('scroll', compute);
    return () => {
      ro.disconnect();
      container.removeEventListener('scroll', compute);
    };
  }, [containerRef, annotations, chapterText]);

  const colorFor = (kind: 'up' | 'down' | 'comment') =>
    kind === 'up' ? '#22c55e' : kind === 'down' ? '#ef4444' : '#eab308';

  return (
    <div className="pointer-events-none absolute left-0 top-0 h-full w-2" aria-hidden>
      {dots.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onClick(d.id)}
          className="pointer-events-auto absolute -translate-y-1/2 rounded-full transition-transform hover:scale-150"
          style={{
            left: 2,
            top: d.top + 8,
            width: 8,
            height: 8,
            background: colorFor(d.kind),
            boxShadow: focusedId === d.id ? `0 0 0 3px ${colorFor(d.kind)}55` : undefined,
          }}
          data-testid="feedback-margin-dot"
          data-annotation-id={d.id}
          title="Reader feedback"
        />
      ))}
    </div>
  );
}

function createDomRange(root: HTMLElement, start: number, end: number): Range | null {
  const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let n: Node | null = walker.nextNode();
  while (n) {
    const len = (n as Text).data.length;
    if (!startNode && count + len >= start) {
      startNode = n;
      startOffset = start - count;
    }
    if (count + len >= end) {
      endNode = n;
      endOffset = end - count;
      break;
    }
    count += len;
    n = walker.nextNode();
  }
  if (!startNode || !endNode) return null;
  try {
    const r = (root.ownerDocument ?? document).createRange();
    r.setStart(startNode, startOffset);
    r.setEnd(endNode, endOffset);
    return r;
  } catch {
    return null;
  }
}

// Inline helper: a button that opens the illustration picker and forwards the
// pick to a callback. Lives in this file (small, single-use, captures the
// chapter context already in scope).
function FullPagePicker({
  worldId,
  chapterId,
  onPick,
}: {
  worldId: string;
  chapterId: string;
  onPick: (illustrationId: string, entityId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-fg-muted hover:text-fg"
        data-testid="insert-full-page-illustration-btn"
        title="Insert a full-page illustration (its own dedicated page in the PDF)"
      >
        + Full-page illustration
      </button>
      {open ? (
        <IllustrationPicker
          worldId={worldId}
          chapterId={chapterId}
          title="Pick a full-page illustration"
          onClose={() => setOpen(false)}
          onPick={(illId, entId) => {
            onPick(illId, entId);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Sidebar control to set / preview / clear the chapter's opening illustration
 * (frontispiece). When set, the PDF emits a dedicated full-page plate just
 * before the chapter title page; the WYSIWYG preview shows it on the verso of
 * the spread. Read-only when chapter is published.
 */
function OpeningIllustrationControl({
  chapterId,
  worldId,
  openingIllustrationId,
  disabled,
}: {
  chapterId: string;
  worldId: string;
  openingIllustrationId: string | null;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const updateChapter = useUpdateChapter();
  const { data: ill } = useIllustration(openingIllustrationId);

  function setIt(id: string | null) {
    void updateChapter.mutateAsync({
      id: chapterId,
      openingIllustrationId: id,
    });
  }

  return (
    <section
      className="flex flex-col gap-2 rounded border border-border bg-bg-panel p-2"
      data-testid="opening-illustration-panel"
    >
      <h3 className="text-[10px] font-medium uppercase tracking-wider text-fg-muted">
        Opening illustration (frontispiece)
      </h3>
      {openingIllustrationId && ill ? (
        <div className="flex flex-col gap-1">
          <img
            src={publicUrlFor(ill.storage_path)}
            alt={ill.alt_text ?? ill.caption ?? ''}
            className="max-h-32 w-full rounded border border-border object-contain"
          />
          {ill.caption ? (
            <p className="line-clamp-2 text-[10px] italic text-fg-muted">
              {ill.caption}
            </p>
          ) : null}
          {!disabled ? (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex-1 rounded border border-border px-2 py-1 text-[10px] text-fg-muted hover:border-fg-muted hover:text-fg"
                data-testid="opening-illustration-replace"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => setIt(null)}
                className="rounded border border-border px-2 py-1 text-[10px] text-fg-muted hover:text-red-400"
                data-testid="opening-illustration-clear"
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>
      ) : openingIllustrationId && !ill ? (
        <p className="text-[10px] italic text-fg-muted">Loading…</p>
      ) : !disabled ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-dashed border-border px-2 py-2 text-[10px] text-fg-muted hover:border-fg-muted hover:text-fg"
          data-testid="opening-illustration-set"
        >
          + Set opening illustration
        </button>
      ) : (
        <p className="text-[10px] italic text-fg-muted">No frontispiece.</p>
      )}
      <p className="text-[9px] text-fg-muted">
        Renders as a full-page plate before the chapter title in the PDF. Verso
        parity is not enforced — it lands wherever pagination puts it.
      </p>
      {open ? (
        <IllustrationPicker
          worldId={worldId}
          chapterId={chapterId}
          title="Pick the chapter opening illustration"
          onClose={() => setOpen(false)}
          onPick={(illId) => {
            setIt(illId);
            setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

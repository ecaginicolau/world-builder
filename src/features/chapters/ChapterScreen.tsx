import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useWorld } from '@/lib/queries/worlds';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useChapterParticipants } from '@/lib/queries/chapterParticipants';
import { useUserSettings } from '@/lib/queries/userSettings';
import { useSession } from '@/features/auth/session';
import { htmlToPlainText } from '@/lib/html';
import { resolveColor } from '@/lib/entityColors';
import { resolveStateAtRank, formatFieldValue } from '@/features/entities/versioning';
import { NoteEditor, type NoteEditorHandle } from '@/features/notes/NoteEditor';
import { ChatPanel } from '@/features/notes/ChatPanel';
import { LinkedEntitiesPanel } from '@/features/notes/NoteEntitiesPanel';
import { DetectedEntitiesPanel } from '@/features/notes/DetectedEntitiesPanel';
import { useAutoExtract } from '@/features/notes/useAutoExtract';
import { useChapterLinkSource } from '@/features/notes/linkSources';
import { VersionsPanel } from './VersionsPanel';
import { ProposeUpdatesModal } from './ProposeUpdatesModal';
import { SummaryPanel } from './SummaryPanel';
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

type RightTab = 'versions' | 'summary' | 'chat';

export function ChapterScreen() {
  const { worldId, chapterId } = useParams({
    from: '/worlds/$worldId/chapters/$chapterId',
  });
  const navigate = useNavigate();
  const session = useSession();
  const chapterQ = useChapter(chapterId);
  const versionsQ = useChapterVersions(chapterId);
  const worldChaptersQ = useChaptersByWorld(worldId);
  const worldQ = useWorld(worldId);
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const participantsQ = useChapterParticipants(chapterId);
  const settingsQ = useUserSettings();
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
  const [summarizing, setSummarizing] = useState<SummaryLength | null>(null);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const editorRef = useRef<NoteEditorHandle>(null);

  const versions = useMemo(() => versionsQ.data ?? [], [versionsQ.data]);
  const finalVersion = useMemo(
    () => versions.find((v) => v.id === chapterQ.data?.final_version_id) ?? versions[versions.length - 1] ?? null,
    [versions, chapterQ.data?.final_version_id],
  );
  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? finalVersion,
    [versions, selectedVersionId, finalVersion],
  );

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

  const selectedTextForLlm = useMemo(() => {
    if (!selectedVersion) return '';
    return htmlToPlainText(selectedVersion.text);
  }, [selectedVersion]);

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
    // The new version is now final; refetch will set chapter.final_version_id.
    // Select it once it lands in the cache.
    // We rely on versionsQ refresh.
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

  async function onUpscale(userPrompt: string, includePcc: boolean) {
    setUpscaleError(null);
    if (upscaling) return;
    if (session.status !== 'authed' || !chapterQ.data || !finalVersion) return;
    setUpscaling(true);
    try {
      // Resolve entity cards at chapter rank.
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
          .eq('entity_id', e.id)
          .order('valid_from_rank', { ascending: true });
        const snap = resolveStateAtRank(
          (vs ?? []) as EntityVersion[],
          chapterQ.data.chronological_rank,
        );
        const snapshot: Record<string, string> = {};
        for (const f of fields) {
          snapshot[f.name] = formatFieldValue(snap?.snapshot[f.name] ?? null);
        }
        cards.push({ id: e.id, name: e.name, type: t?.name ?? 'Unknown', snapshot });
      }
      // Resolve PCC slots if requested.
      const pccSlots = await buildPccSlots({
        includePcc,
        worldId,
        currentChapterId: chapterId,
        currentRank: chapterQ.data.chronological_rank,
        allChapters: worldChaptersQ.data ?? [],
        configuredSlots: worldQ.data?.previous_chapter_context ?? [],
      });
      const upscale = getUpscaler();
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
      // Wrap the LLM text output (plain) in basic <p> tags so Tiptap renders it cleanly.
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
    } finally {
      setUpscaling(false);
    }
  }

  async function onGenerateSummary(len: SummaryLength) {
    setSummarizeError(null);
    if (session.status !== 'authed' || !chapterQ.data || !finalVersion) return;
    if (summarizing) return;
    setSummarizing(len);
    try {
      const summarize = getSummarizer();
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
    const ok = await confirm({ title: 'Delete this chapter?', danger: true });
    if (!ok) return;
    await deleteChapter.mutateAsync({
      id: chapterId,
      partId: chapterQ.data.part_id,
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

  // For draft (v0): use updateVersionText to persist edits in place (the v0 IS the editable workspace).
  // For other origins: edits create a new manual_edit version on Save.
  const isEditingDraft = selectedVersion.origin === 'draft';
  const isPublished = chapterQ.data.status === 'published';

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

  function onEditorDebouncedChange(html: string) {
    if (isPublished) return;
    if (selectedVersion && htmlToPlainText(html) === htmlToPlainText(selectedVersion.text)) {
      setDirty(false);
      return;
    }
    if (isEditingDraft && session.status === 'authed') {
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

  return (
    <main className="mx-auto flex h-full max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex items-center justify-between gap-2">
        <Link
          to="/worlds/$worldId/books"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-books"
        >
          ← Books
        </Link>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => setProposeOpen(true)}
            disabled={isPublished}
            className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel disabled:cursor-not-allowed disabled:opacity-50"
            title={isPublished ? 'Unpublish to propose updates' : undefined}
            data-testid="propose-updates"
          >
            Propose updates
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

      <div className="grid min-h-0 flex-1 gap-4 grid-cols-1 md:grid-cols-[240px_1fr_320px]">
        <aside className="order-2 flex min-h-0 flex-col gap-4 overflow-y-auto md:order-1">
          <LinkedEntitiesPanel worldId={worldId} source={linkSource} />
          <DetectedEntitiesPanel
            worldId={worldId}
            candidates={extract.candidates}
            status={extract.status}
            error={extract.error}
            source={linkSource}
          />
        </aside>

        <div className="order-1 min-h-0 overflow-y-auto md:order-2">
          <NoteEditor
            ref={editorRef}
            key={selectedVersion.id}
            initialContent={selectedVersion.text}
            onChange={onEditorDebouncedChange}
            entityHighlights={entityHighlights}
            readOnly={isPublished}
          />
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
                  dirty={dirty && !isEditingDraft}
                  onSaveManualEdit={onSaveManualEdit}
                  saveManualPending={createVersion.isPending}
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
                />
              </div>
            ) : (
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
                      currentRank: chapterQ.data.chronological_rank,
                      allChapters: worldChaptersQ.data ?? [],
                      configuredSlots: worldQ.data?.previous_chapter_context ?? [],
                    });
                    return formatPccBlock(slots);
                  }}
                />
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
    </main>
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
  currentRank: string;
  allChapters: import('./types').Chapter[];
  configuredSlots: import('@/features/worlds/types').ContextLevel[];
}) {
  const { includePcc, worldId, currentChapterId, currentRank, allChapters, configuredSlots } = args;
  if (!includePcc || configuredSlots.length === 0) return [];

  // Pick the eligible earlier chapters (mirroring resolvePreviousChapters' logic
  // so we only fetch the final-version texts we may need).
  const earlier = allChapters
    .filter((c) => c.id !== currentChapterId && c.chronological_rank < currentRank)
    .sort((a, b) =>
      a.chronological_rank < b.chronological_rank ? 1 :
      a.chronological_rank > b.chronological_rank ? -1 : 0,
    )
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
    finalVersionByChapter: versionsById,
    slots: configuredSlots,
  });
}

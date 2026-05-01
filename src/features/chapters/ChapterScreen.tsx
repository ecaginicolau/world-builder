import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  useChapter,
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
import { getUpscaler, type UpscaleEntityCard } from '@/lib/llm/upscale';
import { logRun } from '@/lib/queries/runs';
import { supabase } from '@/lib/supabase';
import type { EntityHighlightSpec } from '@/features/notes/entityHighlightExtension';
import type { TaggedEntity } from '@/lib/llm';
import type { EntityVersion, FieldDef } from '@/features/entities/types';
import { useConfirm } from '@/lib/useConfirm';

type RightTab = 'versions' | 'chat';

export function ChapterScreen() {
  const { worldId, chapterId } = useParams({
    from: '/worlds/$worldId/chapters/$chapterId',
  });
  const navigate = useNavigate();
  const session = useSession();
  const chapterQ = useChapter(chapterId);
  const versionsQ = useChapterVersions(chapterId);
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

  async function onUpscale(userPrompt: string) {
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
      const upscale = getUpscaler();
      const startedAt = Date.now();
      const result = await upscale({
        worldMemory: worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined,
        worldCustomPrompt: worldQ.data?.custom_prompt ?? undefined,
        chapterTitle: chapterQ.data.title ?? undefined,
        currentText: htmlToPlainText(finalVersion.text),
        userPrompt,
        entityCards: cards,
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

  function onEditorDebouncedChange(html: string) {
    // If the editor's plain-text content matches the version's saved text, nothing to do.
    // (Tiptap normalizes HTML on parse, so raw-string equality is too strict; comparing
    // plain text catches the common case of "no real edit happened yet".)
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
          <button
            type="button"
            onClick={() => setProposeOpen(true)}
            className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel"
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

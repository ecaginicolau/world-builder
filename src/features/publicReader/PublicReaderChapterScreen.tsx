import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ReaderShell } from './ReaderShell';
import { IdentityPrompt } from './IdentityPrompt';
import { SelectionToolbar } from './SelectionToolbar';
import { CommentInput } from './CommentInput';
import { useReaderIdentity } from './useReaderIdentity';
import { useConfirm } from '@/lib/useConfirm';
import {
  deleteMyAnnotation,
  getChapter,
  postAnnotation,
  registerSession,
  resolveLink,
  type ResolvedLinkPayload,
} from './publicReaderClient';
import { renderAnnotated } from './renderAnnotatedHtml';
import type { CapturedSelection } from './selectionContext';
import type {
  AnnotationKind,
  ReaderAnnotation,
  ReaderChapterPayload,
} from './types';

export function PublicReaderChapterScreen() {
  const { token, chapterId } = useParams({ from: '/r/$token/c/$chapterId' });
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { identity, hydrated, setName } = useReaderIdentity(token);

  const [link, setLink] = useState<ResolvedLinkPayload | null>(null);
  const [chapter, setChapter] = useState<ReaderChapterPayload | null>(null);
  const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [askName, setAskName] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [comment, setComment] = useState<
    | { selection: CapturedSelection; anchor: { x: number; y: number } }
    | null
  >(null);

  const bodyRef = useRef<HTMLDivElement>(null);

  // Resolve the link once.
  useEffect(() => {
    let cancelled = false;
    resolveLink(token)
      .then((d) => {
        if (!cancelled) setLink(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.code ?? 'unknown');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Register session on identity change.
  useEffect(() => {
    if (!link || !identity) return;
    void registerSession({
      token,
      readerLocalId: identity.reader_local_id,
      name: identity.name,
    }).catch(() => {});
  }, [link, identity, token]);

  // Load chapter once we have identity + link.
  const loadChapter = useCallback(async () => {
    if (!identity) return;
    try {
      const res = await getChapter({
        token,
        readerLocalId: identity.reader_local_id,
        chapterId,
      });
      setChapter(res.chapter);
      setAnnotations(res.my_annotations);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? 'unknown';
      setError(code);
    }
  }, [identity, token, chapterId]);

  useEffect(() => {
    if (!link || !identity) return;
    void loadChapter();
  }, [link, identity, loadChapter]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  const submitAnnotation = useCallback(
    async (
      kind: AnnotationKind,
      selection: CapturedSelection,
      commentBody?: string,
    ) => {
      if (!identity) return;
      try {
        const res = await postAnnotation({
          token,
          readerLocalId: identity.reader_local_id,
          chapterId,
          kind,
          selectedText: selection.selected_text,
          beforeCtx: selection.before_ctx,
          afterCtx: selection.after_ctx,
          commentBody,
        });
        setAnnotations((prev) => [...prev, res.annotation]);
        showToast(
          kind === 'up'
            ? 'Reaction saved 👍'
            : kind === 'down'
              ? 'Reaction saved 👎'
              : 'Comment saved 💬',
        );
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code ?? 'unknown';
        showToast(`Could not save (${code})`);
      }
    },
    [identity, token, chapterId, showToast],
  );

  const onReact = useCallback(
    (kind: 'up' | 'down', sel: CapturedSelection) => {
      void submitAnnotation(kind, sel);
    },
    [submitAnnotation],
  );

  const onComment = useCallback(
    (sel: CapturedSelection, anchor: { x: number; y: number }) => {
      setComment({ selection: sel, anchor });
    },
    [],
  );

  const onCommentSubmit = useCallback(
    (body: string) => {
      if (!comment) return;
      void submitAnnotation('comment', comment.selection, body);
      setComment(null);
    },
    [comment, submitAnnotation],
  );

  const onDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!identity) return;
      try {
        await deleteMyAnnotation({
          token,
          readerLocalId: identity.reader_local_id,
          annotationId,
        });
        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
        showToast('Annotation removed');
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code ?? 'unknown';
        showToast(`Could not delete (${code})`);
      }
    },
    [identity, token, showToast],
  );

  const rendered = useMemo(() => {
    if (!chapter) return { html: '', orphans: [] };
    return renderAnnotated(
      chapter.text,
      annotations.map((a) => ({
        id: a.id,
        kind: a.kind,
        selected_text: a.selected_text,
        before_ctx: a.before_ctx,
        after_ctx: a.after_ctx,
      })),
    );
  }, [chapter, annotations]);

  // Click on a highlight: confirm + delete (their own).
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    function onClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('mark.reader-annotation');
      if (!target) return;
      const id = target.getAttribute('data-annotation-id');
      if (!id) return;
      const ann = annotations.find((a) => a.id === id);
      if (!ann) return;
      const isComment = ann.kind === 'comment' && ann.comment_body;
      void confirm({
        title: isComment ? 'Your comment' : 'Remove this reaction?',
        message: isComment ? `${ann.comment_body}\n\nDelete this comment?` : undefined,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
        danger: true,
      }).then((ok) => {
        if (ok) void onDeleteAnnotation(id);
      });
    }
    node.addEventListener('click', onClick);
    return () => node.removeEventListener('click', onClick);
  }, [annotations, onDeleteAnnotation, confirm]);

  // Compute prev/next chapter ids in reading order.
  const { prevId, nextId } = useMemo(() => {
    if (!link) return { prevId: null, nextId: null };
    const sorted = [...link.chapters].sort((a, b) =>
      a.reading_rank < b.reading_rank ? -1 : a.reading_rank > b.reading_rank ? 1 : 0,
    );
    const idx = sorted.findIndex((c) => c.id === chapterId);
    return {
      prevId: idx > 0 ? sorted[idx - 1].id : null,
      nextId: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1].id : null,
    };
  }, [link, chapterId]);

  if (error) {
    return (
      <ReaderShell bookTitle={link?.book.title} readerName={identity?.name}>
        <div className="reader-error" data-testid="reader-chapter-error">
          <h2>This chapter can't be opened</h2>
          <p style={{ color: 'var(--reader-fg-muted)' }}>
            ({error}) — it may not be published, or the link may have expired.
          </p>
          <p style={{ marginTop: 16 }}>
            <Link to="/r/$token" params={{ token }} className="reader-link">
              ← Back to contents
            </Link>
          </p>
        </div>
      </ReaderShell>
    );
  }

  if (!link || !chapter) {
    return (
      <ReaderShell bookTitle={link?.book.title} readerName={identity?.name}>
        <div className="reader-toc">
          <p style={{ color: 'var(--reader-fg-muted)' }}>Loading…</p>
        </div>
      </ReaderShell>
    );
  }

  if (hydrated && !identity) {
    return (
      <ReaderShell bookTitle={link.book.title}>
        <IdentityPrompt onSubmit={setName} />
      </ReaderShell>
    );
  }

  if (askName) {
    return (
      <ReaderShell bookTitle={link.book.title} readerName={identity?.name}>
        <IdentityPrompt
          initialName={identity?.name}
          onSubmit={(n) => {
            setName(n);
            setAskName(false);
          }}
        />
      </ReaderShell>
    );
  }

  return (
    <ReaderShell
      bookTitle={link.book.title}
      readerName={identity?.name}
      onChangeName={() => setAskName(true)}
    >
      <div style={{ padding: '24px 16px 64px' }}>
        <div className="reader-prose" style={{ marginBottom: 24 }}>
          <ChapterNav
            token={token}
            prevId={prevId}
            nextId={nextId}
            navigate={navigate}
            position="top"
          />
          <h1
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '2rem',
              fontWeight: 600,
              margin: '0 0 8px',
            }}
          >
            {chapter.title?.trim() || '(untitled chapter)'}
          </h1>
          {chapter.status === 'draft' ? (
            <span className="reader-draft-badge">DRAFT</span>
          ) : null}
        </div>
        <div
          ref={bodyRef}
          className="reader-prose"
          dangerouslySetInnerHTML={{ __html: rendered.html }}
          data-testid="reader-chapter-body"
        />
        <div className="reader-prose" style={{ marginTop: 32 }}>
          <ChapterNav
            token={token}
            prevId={prevId}
            nextId={nextId}
            navigate={navigate}
            position="bottom"
          />
        </div>
      </div>
      <SelectionToolbar
        containerRef={bodyRef}
        enabled={!!identity}
        allowComments={link.link.allow_comments}
        onReact={onReact}
        onComment={onComment}
      />
      {comment ? (
        <CommentInput
          selection={comment.selection}
          anchor={comment.anchor}
          onSubmit={onCommentSubmit}
          onCancel={() => setComment(null)}
        />
      ) : null}
      {toast ? (
        <div className="reader-toast" data-testid="reader-toast">
          {toast}
        </div>
      ) : null}
    </ReaderShell>
  );
}

function ChapterNav({
  token,
  prevId,
  nextId,
  navigate,
  position,
}: {
  token: string;
  prevId: string | null;
  nextId: string | null;
  navigate: ReturnType<typeof useNavigate>;
  position: 'top' | 'bottom';
}) {
  const suffix = position === 'bottom' ? '-bottom' : '';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '0.85rem',
        color: 'var(--reader-fg-muted)',
        marginBottom: position === 'top' ? 16 : 0,
        marginTop: position === 'bottom' ? 16 : 0,
        paddingTop: position === 'bottom' ? 16 : 0,
        borderTop:
          position === 'bottom' ? '1px solid var(--reader-rule, #e5e5e5)' : 'none',
      }}
    >
      <Link
        to="/r/$token"
        params={{ token }}
        className="reader-link"
        data-testid={`reader-back-toc${suffix}`}
      >
        ← Contents
      </Link>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="reader-btn"
          disabled={!prevId}
          onClick={() =>
            prevId &&
            navigate({
              to: '/r/$token/c/$chapterId',
              params: { token, chapterId: prevId },
            })
          }
          data-testid={`reader-prev${suffix}`}
        >
          ← Prev
        </button>
        <button
          type="button"
          className="reader-btn"
          disabled={!nextId}
          onClick={() =>
            nextId &&
            navigate({
              to: '/r/$token/c/$chapterId',
              params: { token, chapterId: nextId },
            })
          }
          data-testid={`reader-next${suffix}`}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

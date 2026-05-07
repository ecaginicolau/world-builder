import { useEffect, useMemo, useRef } from 'react';
import {
  useDeleteReaderAnnotation,
  useReaderAnnotationsByChapter,
  type ReaderAnnotationRow,
} from '@/lib/queries/readerAnnotations';
import { useReaderSessionsByLink } from '@/lib/queries/readerSessions';
import { useShareLinksByBook } from '@/lib/queries/shareLinks';
import { useConfirm } from '@/lib/useConfirm';

interface Props {
  chapterId: string;
  bookId: string;
  focusAnnotationId: string | null;
  onFocus: (annotationId: string) => void;
}

export function ReaderFeedbackPanel({
  chapterId,
  bookId,
  focusAnnotationId,
  onFocus,
}: Props) {
  const annotationsQ = useReaderAnnotationsByChapter(chapterId);
  const linksQ = useShareLinksByBook(bookId);
  const remove = useDeleteReaderAnnotation();
  const confirm = useConfirm();

  // Fetch sessions for every link of the book and merge.
  const links = linksQ.data ?? [];
  const itemRefs = useRef<Map<string, HTMLLIElement | null>>(new Map());

  // Auto-scroll to focused annotation.
  useEffect(() => {
    if (!focusAnnotationId) return;
    const el = itemRefs.current.get(focusAnnotationId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusAnnotationId, annotationsQ.data]);

  if (annotationsQ.isLoading) {
    return <p className="px-3 py-3 text-sm text-fg-muted">Loading…</p>;
  }
  const annotations = annotationsQ.data ?? [];
  if (annotations.length === 0) {
    return (
      <p className="px-3 py-3 text-sm text-fg-muted" data-testid="feedback-empty">
        No reader feedback on this chapter yet.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto" data-testid="feedback-panel">
      <ul className="space-y-2 p-2">
        {annotations.map((a) => (
          <FeedbackItem
            key={a.id}
            annotation={a}
            links={links}
            focused={a.id === focusAnnotationId}
            setRef={(el) => {
              itemRefs.current.set(a.id, el);
            }}
            onFocus={() => onFocus(a.id)}
            onDelete={async () => {
              const ok = await confirm({ title: 'Delete this feedback?', danger: true });
              if (!ok) return;
              remove.mutate({
                id: a.id,
                chapterId: a.chapter_id,
                linkId: a.share_link_id,
              });
            }}
          />
        ))}
      </ul>
    </div>
  );
}

interface FeedbackItemProps {
  annotation: ReaderAnnotationRow;
  links: { id: string; label: string | null }[];
  focused: boolean;
  onFocus: () => void;
  onDelete: () => void;
  setRef: (el: HTMLLIElement | null) => void;
}

function FeedbackItem({ annotation, links, focused, onFocus, onDelete, setRef }: FeedbackItemProps) {
  const linkLabel = useMemo(() => {
    const link = links.find((l) => l.id === annotation.share_link_id);
    return link?.label ?? null;
  }, [annotation.share_link_id, links]);

  // Resolve reader name through the link's sessions.
  const sessionsQ = useReaderSessionsByLink(annotation.share_link_id);
  const readerName = useMemo(() => {
    return sessionsQ.data?.find((s) => s.id === annotation.reader_session_id)?.name ?? '(unknown)';
  }, [sessionsQ.data, annotation.reader_session_id]);

  return (
    <li
      ref={setRef}
      className={
        'rounded-md border bg-bg-panel px-3 py-2 text-sm transition-colors ' +
        (focused ? 'border-accent shadow-[0_0_0_1px] shadow-accent' : 'border-border')
      }
      data-testid="feedback-item"
      data-annotation-id={annotation.id}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <KindIcon kind={annotation.kind} />
          <span className="font-medium">{readerName}</span>
          {linkLabel ? (
            <span className="text-[10px] text-fg-muted">via {linkLabel}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFocus}
            className="text-xs text-fg-muted hover:text-fg"
            data-testid="feedback-focus"
            title="Highlight in chapter text"
          >
            ↗ focus
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-fg-muted hover:text-red-400"
            data-testid="feedback-delete"
          >
            delete
          </button>
        </div>
      </div>
      <div className="mt-1 text-xs italic text-fg-muted">
        "{truncate(annotation.selected_text, 120)}"
      </div>
      {annotation.comment_body ? (
        <div className="mt-1 whitespace-pre-wrap">{annotation.comment_body}</div>
      ) : null}
      <div className="mt-1 text-[10px] text-fg-muted">{formatDate(annotation.created_at)}</div>
    </li>
  );
}

function KindIcon({ kind }: { kind: 'up' | 'down' | 'comment' }) {
  if (kind === 'up') return <span title="Liked">👍</span>;
  if (kind === 'down') return <span title="Disliked">👎</span>;
  return <span title="Comment">💬</span>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

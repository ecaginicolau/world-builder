import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useShareLink, useUpdateShareLink } from '@/lib/queries/shareLinks';
import { useReaderSessionsByLink } from '@/lib/queries/readerSessions';
import {
  useDeleteReaderAnnotation,
  useReaderAnnotationsByLink,
} from '@/lib/queries/readerAnnotations';
import { useChaptersByWorld } from '@/lib/queries/chapters';
import { useConfirm } from '@/lib/useConfirm';

export function ShareLinkDetailScreen() {
  const { worldId, bookId, linkId } = useParams({
    from: '/worlds/$worldId/books/$bookId/shares/$linkId',
  });
  const linkQ = useShareLink(linkId);
  const sessionsQ = useReaderSessionsByLink(linkId);
  const annotationsQ = useReaderAnnotationsByLink(linkId);
  const chaptersQ = useChaptersByWorld(worldId);
  const update = useUpdateShareLink();
  const remove = useDeleteReaderAnnotation();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'readers' | 'annotations'>('readers');

  const link = linkQ.data;

  if (linkQ.isLoading || !link) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-6">
        <p className="text-fg-muted">Loading…</p>
      </main>
    );
  }

  const url = `${window.location.origin}/r/${link.token}`;
  const sessions = sessionsQ.data ?? [];
  const annotations = annotationsQ.data ?? [];
  const chaptersById = new Map((chaptersQ.data ?? []).map((c) => [c.id, c]));
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));

  const annotationsBySession = new Map<string, number>();
  for (const a of annotations) {
    annotationsBySession.set(a.reader_session_id, (annotationsBySession.get(a.reader_session_id) ?? 0) + 1);
  }

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto px-6 py-6">
      <header>
        <Link
          to="/worlds/$worldId/books/$bookId"
          params={{ worldId, bookId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="share-link-back"
        >
          ← Back to book
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {link.label ?? '(untitled link)'}
        </h1>
        <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
          <span className="font-mono">{url}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(url)}
            className="bg-bg-subtle px-2 py-0.5 hover:bg-bg"
          >
            copy
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Toggle
            label="Active"
            checked={link.active}
            onChange={(v) => update.mutate({ id: link.id, active: v })}
            testId="share-detail-active"
          />
          <Toggle
            label="Comments"
            checked={link.allow_comments}
            onChange={(v) => update.mutate({ id: link.id, allowComments: v })}
            testId="share-detail-comments"
          />
          <Toggle
            label="Drafts"
            checked={link.include_drafts}
            onChange={(v) => update.mutate({ id: link.id, includeDrafts: v })}
            testId="share-detail-drafts"
          />
        </div>
      </header>

      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === 'readers'} onClick={() => setTab('readers')} testId="tab-readers">
          Readers ({sessions.length})
        </TabButton>
        <TabButton
          active={tab === 'annotations'}
          onClick={() => setTab('annotations')}
          testId="tab-annotations"
        >
          All feedback ({annotations.length})
        </TabButton>
      </div>

      {tab === 'readers' ? (
        sessions.length === 0 ? (
          <p className="text-sm text-fg-muted" data-testid="readers-empty">
            No one has opened this link yet.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm" data-testid="readers-table">
            <thead>
              <tr className="text-left text-xs text-fg-muted">
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">First seen</th>
                <th className="px-2 py-1">Last seen</th>
                <th className="px-2 py-1">Reactions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-2 py-1 font-medium">{s.name}</td>
                  <td className="px-2 py-1 text-fg-muted">{formatDate(s.first_seen_at)}</td>
                  <td className="px-2 py-1 text-fg-muted">{formatDate(s.last_seen_at)}</td>
                  <td className="px-2 py-1">{annotationsBySession.get(s.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : annotations.length === 0 ? (
        <p className="text-sm text-fg-muted" data-testid="annotations-empty">
          No feedback yet.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="annotations-list">
          {annotations.map((a) => {
            const chapter = chaptersById.get(a.chapter_id);
            const reader = sessionsById.get(a.reader_session_id);
            return (
              <li
                key={a.id}
                className="rounded-md border border-border bg-bg-panel px-3 py-2 text-sm"
                data-testid="annotation-row"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <KindIcon kind={a.kind} />
                    <span className="font-medium">{reader?.name ?? '(unknown)'}</span>
                    <span className="text-xs text-fg-muted">
                      on{' '}
                      {chapter ? (
                        <a
                          href={`/worlds/${worldId}/chapters/${a.chapter_id}#ann=${a.id}`}
                          className="hover:underline"
                          data-testid="annotation-focus-link"
                        >
                          {chapter.title?.trim() || '(untitled chapter)'}
                        </a>
                      ) : (
                        '(unknown chapter)'
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete this feedback?',
                        danger: true,
                      });
                      if (!ok) return;
                      remove.mutate({
                        id: a.id,
                        chapterId: a.chapter_id,
                        linkId: link.id,
                      });
                    }}
                    className="text-xs text-fg-muted hover:text-red-400"
                    data-testid="annotation-delete"
                  >
                    delete
                  </button>
                </div>
                <div className="mt-1 text-xs italic text-fg-muted">
                  "{truncate(a.selected_text, 200)}"
                </div>
                {a.comment_body ? (
                  <div className="mt-1 whitespace-pre-wrap text-sm">{a.comment_body}</div>
                ) : null}
                <div className="mt-1 text-[10px] text-fg-muted">{formatDate(a.created_at)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={
        'rounded px-2 py-1 ' +
        (checked
          ? 'bg-emerald-500/20 text-emerald-300'
          : 'bg-bg-subtle text-fg-muted hover:bg-bg')
      }
      data-testid={testId}
    >
      {checked ? '✓ ' : '○ '}
      {label}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-3 py-2 text-sm ' +
        (active
          ? 'border-b-2 border-accent font-medium text-fg'
          : 'text-fg-muted hover:text-fg')
      }
      data-testid={testId}
    >
      {children}
    </button>
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

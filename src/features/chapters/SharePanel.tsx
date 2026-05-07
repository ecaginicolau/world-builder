import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useSession } from '@/features/auth/session';
import { useConfirm } from '@/lib/useConfirm';
import {
  useCreateShareLink,
  useDeleteShareLink,
  useShareLinksByBook,
  useUpdateShareLink,
  type ShareLink,
} from '@/lib/queries/shareLinks';

interface Props {
  worldId: string;
  bookId: string;
}

export function SharePanel({ worldId, bookId }: Props) {
  const session = useSession();
  const linksQ = useShareLinksByBook(bookId);
  const create = useCreateShareLink();
  const update = useUpdateShareLink();
  const remove = useDeleteShareLink();
  const confirm = useConfirm();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <section
      className="rounded-md border border-border bg-bg-panel"
      data-testid="share-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="text-sm font-medium">Public reader links</div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="bg-accent px-2 py-1 text-xs font-medium text-accent-fg"
          data-testid="share-create-open"
        >
          + Create link
        </button>
      </header>

      {showCreate && session.status === 'authed' ? (
        <CreateForm
          onCancel={() => setShowCreate(false)}
          onSubmit={async (vals) => {
            await create.mutateAsync({
              worldId,
              bookId,
              ownerId: session.session.user.id,
              ...vals,
            });
            setShowCreate(false);
          }}
          pending={create.isPending}
        />
      ) : null}

      {linksQ.isLoading ? (
        <p className="px-3 py-3 text-sm text-fg-muted">Loading…</p>
      ) : (linksQ.data ?? []).length === 0 ? (
        <p
          className="px-3 py-3 text-sm text-fg-muted"
          data-testid="share-links-empty"
        >
          No share links yet. Create one to let someone read this book.
        </p>
      ) : (
        <ul className="divide-y divide-border" data-testid="share-links-list">
          {(linksQ.data ?? []).map((link) => (
            <ShareLinkRow
              key={link.id}
              link={link}
              worldId={worldId}
              onToggleActive={(active) => update.mutate({ id: link.id, active })}
              onDelete={async () => {
                const ok = await confirm({
                  title: `Delete this share link?`,
                  message:
                    'Anyone using it will lose access. Reader sessions and annotations attached to it will be deleted too.',
                  danger: true,
                });
                if (!ok) return;
                remove.mutate({ id: link.id, bookId });
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface CreateFormValues {
  label: string | null;
  allowComments: boolean;
  includeDrafts: boolean;
  expiresAt: string | null;
}

function CreateForm({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (v: CreateFormValues) => Promise<void>;
  pending: boolean;
}) {
  const [label, setLabel] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [expiresOption, setExpiresOption] = useState<'30d' | 'never' | 'custom'>('30d');
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  });

  function computeExpiresAt(): string | null {
    if (expiresOption === 'never') return null;
    if (expiresOption === '30d') {
      return new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    }
    return new Date(customDate + 'T23:59:59').toISOString();
  }

  function handle(e: FormEvent) {
    e.preventDefault();
    void onSubmit({
      label: label.trim() || null,
      allowComments,
      includeDrafts,
      expiresAt: computeExpiresAt(),
    });
  }

  return (
    <form
      onSubmit={handle}
      className="space-y-3 border-b border-border bg-bg-subtle/40 px-3 py-3"
      data-testid="share-create-form"
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional, e.g. 'Beta readers Q2')"
        className="w-full px-3 py-2 text-sm"
        data-testid="share-create-label"
        maxLength={120}
      />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allowComments}
            onChange={(e) => setAllowComments(e.target.checked)}
            data-testid="share-create-comments"
          />
          Allow comments
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeDrafts}
            onChange={(e) => setIncludeDrafts(e.target.checked)}
            data-testid="share-create-drafts"
          />
          Include unpublished chapters (drafts)
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="expires"
            checked={expiresOption === '30d'}
            onChange={() => setExpiresOption('30d')}
          />
          30 days
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="expires"
            checked={expiresOption === 'custom'}
            onChange={() => setExpiresOption('custom')}
          />
          Custom
        </label>
        {expiresOption === 'custom' ? (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="px-2 py-1 text-xs"
            data-testid="share-create-custom-date"
          />
        ) : null}
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="expires"
            checked={expiresOption === 'never'}
            onChange={() => setExpiresOption('never')}
          />
          No expiration
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg"
          data-testid="share-create-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
          data-testid="share-create-submit"
        >
          Create link
        </button>
      </div>
    </form>
  );
}

function ShareLinkRow({
  link,
  worldId,
  onToggleActive,
  onDelete,
}: {
  link: ShareLink;
  worldId: string;
  onToggleActive: (active: boolean) => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${link.token}`;
  const expired = link.expires_at && new Date(link.expires_at) < new Date();
  const status: 'active' | 'inactive' | 'expired' = !link.active
    ? 'inactive'
    : expired
      ? 'expired'
      : 'active';
  const statusColor =
    status === 'active' ? 'text-emerald-400' : status === 'expired' ? 'text-amber-400' : 'text-fg-muted';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3" data-testid="share-link-row">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            to="/worlds/$worldId/books/$bookId/shares/$linkId"
            params={{ worldId, bookId: link.book_id, linkId: link.id }}
            className="truncate text-sm font-medium hover:underline"
            data-testid="share-link-label"
          >
            {link.label ?? '(untitled link)'}
          </Link>
          <span className={`text-[10px] uppercase tracking-wide ${statusColor}`}>
            {status}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
          <span className="truncate font-mono">{url}</span>
          <button
            type="button"
            onClick={copy}
            className="bg-bg-subtle px-1.5 py-0.5 text-[10px] hover:bg-bg"
            data-testid="share-link-copy"
          >
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
        <div className="mt-0.5 text-[11px] text-fg-muted">
          {link.allow_comments ? '💬 comments on' : '💬 comments off'}
          {' · '}
          {link.include_drafts ? '📝 includes drafts' : '✓ published only'}
          {' · '}
          {link.expires_at ? `expires ${formatDate(link.expires_at)}` : 'no expiration'}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleActive(!link.active)}
          className="bg-bg-subtle px-2 py-1 text-xs hover:bg-bg"
          data-testid="share-link-toggle-active"
        >
          {link.active ? 'Deactivate' : 'Activate'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-2 py-1 text-xs text-fg-muted hover:text-red-400"
          data-testid="share-link-delete"
        >
          delete
        </button>
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

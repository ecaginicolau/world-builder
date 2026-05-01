import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useGlobalSearch } from '@/lib/useGlobalSearch';
import { useGlobalSearchResults, type SearchHit } from '@/lib/queries/search';

export function GlobalSearchModal() {
  const { isOpen, worldId, close, open } = useGlobalSearch();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Cmd/Ctrl+K opens the modal (with the current world if any).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const m = window.location.pathname.match(/\/worlds\/([0-9a-f-]{36})/i);
        if (m) open(m[1]);
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, open, close]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const resultsQ = useGlobalSearchResults(worldId, query);

  if (!isOpen) return null;

  const grouped = groupResults(resultsQ.data ?? []);

  function go(hit: SearchHit) {
    close();
    if (hit.kind === 'note') {
      void navigate({
        to: '/worlds/$worldId/notes/$noteId',
        params: { worldId: hit.worldId, noteId: hit.id },
      });
    } else if (hit.kind === 'chapter') {
      void navigate({
        to: '/worlds/$worldId/chapters/$chapterId',
        params: { worldId: hit.worldId, chapterId: hit.chapterId ?? hit.id },
      });
    } else {
      void navigate({
        to: '/worlds/$worldId/entities/$entityId',
        params: { worldId: hit.worldId, entityId: hit.id },
      });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-24"
      onClick={close}
      data-testid="search-modal"
    >
      <div
        className="w-full max-w-xl rounded-md border border-border bg-bg-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes, chapters, entities…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm focus:outline-none"
          data-testid="search-input"
        />
        <div className="max-h-[60vh] overflow-y-auto" data-testid="search-results">
          {query.trim().length < 2 ? (
            <p className="px-4 py-3 text-xs text-fg-muted">Type at least 2 characters.</p>
          ) : resultsQ.isLoading ? (
            <p className="px-4 py-3 text-xs text-fg-muted">Searching…</p>
          ) : resultsQ.error ? (
            <p className="px-4 py-3 text-xs text-red-400">{resultsQ.error.message}</p>
          ) : (resultsQ.data ?? []).length === 0 ? (
            <p className="px-4 py-3 text-xs text-fg-muted">No results.</p>
          ) : (
            <>
              <Group title="Notes" hits={grouped.note} onSelect={go} kind="note" />
              <Group title="Chapters" hits={grouped.chapter} onSelect={go} kind="chapter" />
              <Group title="Entities" hits={grouped.entity} onSelect={go} kind="entity" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function groupResults(hits: SearchHit[]): Record<'note' | 'chapter' | 'entity', SearchHit[]> {
  return {
    note: hits.filter((h) => h.kind === 'note'),
    chapter: hits.filter((h) => h.kind === 'chapter'),
    entity: hits.filter((h) => h.kind === 'entity'),
  };
}

function Group({
  title, hits, onSelect, kind,
}: {
  title: string;
  hits: SearchHit[];
  onSelect: (h: SearchHit) => void;
  kind: 'note' | 'chapter' | 'entity';
}) {
  if (hits.length === 0) return null;
  return (
    <div className="border-b border-border last:border-b-0" data-testid={`search-group-${kind}`}>
      <div className="px-4 py-1 text-[10px] font-mono uppercase tracking-wide text-fg-muted">
        {title} ({hits.length})
      </div>
      <ul>
        {hits.map((h) => (
          <li key={`${h.kind}-${h.id}`}>
            <button
              type="button"
              onClick={() => onSelect(h)}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-bg-subtle"
              data-testid={`search-hit-${h.kind}`}
            >
              <div className="font-medium">{h.title}</div>
              {h.snippet ? (
                <div className="line-clamp-2 text-xs text-fg-muted">{h.snippet}</div>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

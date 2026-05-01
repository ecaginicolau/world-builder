import { useMemo, useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useWorlds } from '@/lib/queries/worlds';
import { useMonitoringToggle } from './useMonitoringToggle';
import { useGlobalSearch } from '@/lib/useGlobalSearch';

const WORLD_ID_RE = /^\/worlds\/([0-9a-f-]{36})(?:\/|$)/i;

function extractWorldId(pathname: string): string | null {
  const m = pathname.match(WORLD_ID_RE);
  return m ? m[1] : null;
}

type Section = 'notes' | 'entities' | 'books' | 'timeline' | 'read' | 'runs' | 'settings';

function activeSection(pathname: string, worldId: string | null): Section | null {
  if (!worldId) return null;
  if (pathname.includes('/entities')) return 'entities';
  if (pathname.includes('/read')) return 'read';
  if (pathname.includes('/books') || pathname.includes('/chapters/')) return 'books';
  if (pathname.includes('/timeline')) return 'timeline';
  if (pathname.includes('/runs')) return 'runs';
  if (pathname.includes('/settings')) return 'settings';
  if (pathname === `/worlds/${worldId}` || pathname.startsWith(`/worlds/${worldId}/notes`)) {
    return 'notes';
  }
  return null;
}

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const worldsQ = useWorlds();
  const monitoring = useMonitoringToggle();
  const globalSearch = useGlobalSearch();
  const [worldMenuOpen, setWorldMenuOpen] = useState(false);

  const worldId = extractWorldId(pathname);
  const section = activeSection(pathname, worldId);
  const currentWorld = useMemo(
    () => (worldId ? (worldsQ.data ?? []).find((w) => w.id === worldId) ?? null : null),
    [worldsQ.data, worldId],
  );

  // Hide on login + index.
  if (pathname === '/login' || pathname === '/') return null;

  return (
    <header
      className="sticky top-0 z-40 flex h-10 items-center justify-between border-b border-border bg-bg/95 px-3 backdrop-blur"
      data-testid="app-header"
    >
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => setWorldMenuOpen((v) => !v)}
          className="bg-bg-subtle px-2 py-1 text-sm hover:bg-bg-panel"
          data-testid="world-menu-toggle"
        >
          {currentWorld?.name ?? 'Worlds'} ▾
        </button>
        {worldMenuOpen ? (
          <div
            className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border bg-bg-panel py-1 shadow-lg"
            data-testid="world-menu"
          >
            <Link
              to="/worlds"
              onClick={() => setWorldMenuOpen(false)}
              className="block px-3 py-1 text-xs text-fg-muted hover:bg-bg-subtle"
              data-testid="world-menu-all"
            >
              All worlds
            </Link>
            <div className="my-1 border-t border-border" />
            {(worldsQ.data ?? []).map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  setWorldMenuOpen(false);
                  void navigate({ to: '/worlds/$worldId', params: { worldId: w.id } });
                }}
                className={
                  'block w-full px-3 py-1 text-left text-sm hover:bg-bg-subtle ' +
                  (w.id === worldId ? 'text-fg' : 'text-fg-muted')
                }
                data-testid="world-menu-item"
              >
                {w.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {worldId ? (
        <nav className="flex items-center gap-1" data-testid="section-tabs">
          <SectionLink
            to="/worlds/$worldId"
            params={{ worldId }}
            active={section === 'notes'}
            label="Notes"
            icon="📝"
            testid="tab-notes"
          />
          <SectionLink
            to="/worlds/$worldId/entities"
            params={{ worldId }}
            active={section === 'entities'}
            label="Entities"
            icon="🧬"
            testid="tab-entities"
          />
          <SectionLink
            to="/worlds/$worldId/books"
            params={{ worldId }}
            active={section === 'books'}
            label="Books"
            icon="📚"
            testid="tab-books"
          />
          <SectionLink
            to="/worlds/$worldId/timeline"
            params={{ worldId }}
            active={section === 'timeline'}
            label="Timeline"
            icon="📅"
            testid="tab-timeline"
          />
          <SectionLink
            to="/worlds/$worldId/read"
            params={{ worldId }}
            active={section === 'read'}
            label="Read"
            icon="📖"
            testid="tab-read"
          />
        </nav>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-1">
        {worldId ? (
          <button
            type="button"
            onClick={() => globalSearch.open(worldId)}
            className="bg-bg-subtle px-2 py-1 text-sm hover:bg-bg-panel"
            title="Search (Ctrl/Cmd+K)"
            data-testid="search-toggle"
          >
            🔍
          </button>
        ) : null}
        <button
          type="button"
          onClick={monitoring.toggle}
          className={
            'px-2 py-1 text-sm ' +
            (monitoring.open ? 'bg-accent text-accent-fg' : 'bg-bg-subtle hover:bg-bg-panel')
          }
          title="Toggle monitoring panel"
          data-testid="monitoring-toggle"
        >
          📊
        </button>
        {worldId ? (
          <Link
            to="/worlds/$worldId/settings"
            params={{ worldId }}
            className={
              'px-2 py-1 text-sm ' +
              (section === 'settings' ? 'bg-accent text-accent-fg' : 'bg-bg-subtle hover:bg-bg-panel')
            }
            title="Settings"
            data-testid="tab-settings"
          >
            ⚙
          </Link>
        ) : null}
      </div>
    </header>
  );
}

interface SectionLinkProps {
  to:
    | '/worlds/$worldId'
    | '/worlds/$worldId/entities'
    | '/worlds/$worldId/books'
    | '/worlds/$worldId/timeline'
    | '/worlds/$worldId/read';
  params: { worldId: string };
  active: boolean;
  label: string;
  icon: string;
  testid: string;
}

function SectionLink({ to, params, active, label, icon, testid }: SectionLinkProps) {
  return (
    <Link
      to={to}
      params={params}
      className={
        'px-2 py-1 text-sm ' +
        (active ? 'bg-accent text-accent-fg' : 'bg-bg-subtle hover:bg-bg-panel')
      }
      data-testid={testid}
    >
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden" aria-label={label}>{icon}</span>
    </Link>
  );
}

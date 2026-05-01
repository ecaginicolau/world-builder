import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/features/auth/session';
import { useWorlds, useCreateWorld } from '@/lib/queries/worlds';

export function WorldsScreen() {
  const session = useSession();
  const worldsQ = useWorlds();
  const createWorld = useCreateWorld();
  const [name, setName] = useState('');

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || session.status !== 'authed') return;
    await createWorld.mutateAsync({
      name: name.trim(),
      ownerId: session.session.user.id,
    });
    setName('');
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <main className="mx-auto flex h-full max-w-2xl flex-col gap-6 px-6 py-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Worlds</h1>
          {session.status === 'authed' ? (
            <p className="text-sm text-fg-muted">
              Signed in as {session.session.user.email ?? session.session.user.id}
            </p>
          ) : null}
        </div>
        <button
          onClick={signOut}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="signout"
        >
          Sign out
        </button>
      </header>

      <form onSubmit={onCreate} className="flex gap-2" data-testid="create-world-form">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New world name"
          className="flex-1 px-3 py-2"
          data-testid="create-world-name"
        />
        <button
          type="submit"
          disabled={createWorld.isPending || !name.trim()}
          className="bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-50"
          data-testid="create-world-submit"
        >
          {createWorld.isPending ? 'Creating…' : 'Create'}
        </button>
      </form>

      {worldsQ.error ? (
        <p className="text-sm text-red-400" data-testid="worlds-error">
          {worldsQ.error.message}
        </p>
      ) : null}
      {createWorld.error ? (
        <p className="text-sm text-red-400" data-testid="worlds-error">
          {createWorld.error.message}
        </p>
      ) : null}

      {worldsQ.isLoading ? (
        <p className="text-fg-muted">Loading…</p>
      ) : worldsQ.data && worldsQ.data.length === 0 ? (
        <p className="text-fg-muted" data-testid="worlds-empty">
          No worlds yet. Create one above.
        </p>
      ) : worldsQ.data ? (
        <ul className="space-y-2" data-testid="worlds-list">
          {worldsQ.data.map((w) => (
            <li
              key={w.id}
              className="rounded-md border border-border bg-bg-panel"
              data-testid="world-item"
            >
              <Link
                to="/worlds/$worldId"
                params={{ worldId: w.id }}
                className="block px-4 py-3 hover:bg-bg-subtle"
                data-testid="world-link"
              >
                <div className="font-medium">{w.name}</div>
                {w.description ? (
                  <div className="text-sm text-fg-muted">{w.description}</div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

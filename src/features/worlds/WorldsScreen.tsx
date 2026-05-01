import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { World } from './types';

interface Props {
  session: Session;
}

export function WorldsScreen({ session }: Props) {
  const [worlds, setWorlds] = useState<World[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('worlds')
      .select('id, name, description, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setWorlds(data ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createWorld(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const { error } = await supabase.from('worlds').insert({
      owner_id: session.user.id,
      name: name.trim(),
    });
    setCreating(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName('');
    await reload();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <main className="mx-auto flex h-full max-w-2xl flex-col gap-6 px-6 py-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Worlds</h1>
          <p className="text-sm text-fg-muted">
            Signed in as {session.user.email ?? session.user.id}
          </p>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="signout"
        >
          Sign out
        </button>
      </header>

      <form onSubmit={createWorld} className="flex gap-2" data-testid="create-world-form">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New world name"
          className="flex-1 px-3 py-2"
          data-testid="create-world-name"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-50"
          data-testid="create-world-submit"
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
      </form>

      {error ? (
        <p className="text-sm text-red-400" data-testid="worlds-error">
          {error}
        </p>
      ) : null}

      {worlds === null ? (
        <p className="text-fg-muted">Loading…</p>
      ) : worlds.length === 0 ? (
        <p className="text-fg-muted" data-testid="worlds-empty">
          No worlds yet. Create one above.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="worlds-list">
          {worlds.map((w) => (
            <li
              key={w.id}
              className="rounded-md border border-border bg-bg-panel px-4 py-3"
              data-testid="world-item"
            >
              <div className="font-medium">{w.name}</div>
              {w.description ? (
                <div className="text-sm text-fg-muted">{w.description}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

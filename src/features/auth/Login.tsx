import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

export function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'sending' });
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus({ kind: 'error', message: error.message });
      return;
    }
    setStatus({ kind: 'sent' });
  }

  async function signInWithGoogle() {
    setStatus({ kind: 'sending' });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setStatus({ kind: 'error', message: error.message });
    }
  }

  return (
    <main className="mx-auto flex h-full max-w-sm flex-col justify-center gap-6 px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">World Builder</h1>
        <p className="text-sm text-fg-muted">
          Sign in to start capturing your worlds.
        </p>
      </header>

      <form onSubmit={sendMagicLink} className="space-y-3" data-testid="login-form">
        <label className="block space-y-1">
          <span className="text-sm text-fg-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2"
            data-testid="login-email"
          />
        </label>
        <button
          type="submit"
          disabled={status.kind === 'sending'}
          className="w-full bg-accent px-3 py-2 font-medium text-accent-fg disabled:opacity-50"
          data-testid="login-submit"
        >
          {status.kind === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-fg-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="w-full border border-border bg-bg-panel px-3 py-2 hover:bg-bg-subtle"
        data-testid="login-google"
      >
        Continue with Google
      </button>

      {status.kind === 'sent' ? (
        <p className="text-sm text-fg-muted" data-testid="login-status">
          Magic link sent. Check your inbox.
        </p>
      ) : null}
      {status.kind === 'error' ? (
        <p className="text-sm text-red-400" data-testid="login-error">
          {status.message}
        </p>
      ) : null}
    </main>
  );
}

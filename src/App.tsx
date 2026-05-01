import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Login } from './features/auth/Login';
import { WorldsScreen } from './features/worlds/WorldsScreen';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="h-full">
      {session ? <WorldsScreen session={session} /> : <Login />}
    </div>
  );
}

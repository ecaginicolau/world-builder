import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useSession } from '@/features/auth/session';

export function IndexRoute() {
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session.status === 'authed') {
      void navigate({ to: '/worlds', replace: true });
    } else if (session.status === 'anon') {
      void navigate({ to: '/login', replace: true });
    }
  }, [session.status, navigate]);

  return (
    <div className="flex h-full items-center justify-center text-fg-muted">
      Loading…
    </div>
  );
}

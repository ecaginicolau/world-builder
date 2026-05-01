import type { ReactNode } from 'react';
import { useSession } from '@/features/auth/session';
import { useEffect } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';

interface Props {
  children: ReactNode;
}

export function RootLayout({ children }: Props) {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (session.status === 'anon' && pathname !== '/login') {
      void navigate({ to: '/login' });
    }
    if (session.status === 'authed' && pathname === '/login') {
      void navigate({ to: '/worlds' });
    }
  }, [session.status, pathname, navigate]);

  if (session.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted" data-testid="boot">
        Loading…
      </div>
    );
  }

  return <div className="h-full">{children}</div>;
}

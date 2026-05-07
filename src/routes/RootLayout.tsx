import type { ReactNode } from 'react';
import { useSession } from '@/features/auth/session';
import { useEffect } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { AppHeader } from '@/components/AppHeader';
import { MonitoringPanel } from '@/components/MonitoringPanel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { GlobalSearchModal } from '@/components/GlobalSearchModal';

interface Props {
  children: ReactNode;
}

export function RootLayout({ children }: Props) {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isPublicReader = pathname.startsWith('/r/');

  useEffect(() => {
    if (isPublicReader) return;
    if (session.status === 'anon' && pathname !== '/login') {
      void navigate({ to: '/login' });
    }
    if (session.status === 'authed' && pathname === '/login') {
      void navigate({ to: '/worlds' });
    }
  }, [session.status, pathname, navigate, isPublicReader]);

  if (session.status === 'loading' && !isPublicReader) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted" data-testid="boot">
        Loading…
      </div>
    );
  }

  if (isPublicReader) {
    return (
      <>
        {children}
        <ConfirmDialog />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {session.status === 'authed' ? <AppHeader /> : null}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {session.status === 'authed' ? <MonitoringPanel /> : null}
      {session.status === 'authed' ? <GlobalSearchModal /> : null}
      <ConfirmDialog />
    </div>
  );
}

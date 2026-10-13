import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** An open tab otherwise keeps running its old JS, even after a deployment. */
export function AppUpdateNotice() {
  const registration = useRef<ServiceWorkerRegistration>();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, worker) {
      registration.current = worker;
    },
  });

  useEffect(() => {
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void registration.current?.update().catch(() => {
          // Temporary network failures should not interrupt writing.
        });
      }
    };
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', checkForUpdate);
    const timer = window.setInterval(checkForUpdate, 60_000);
    return () => {
      window.removeEventListener('focus', checkForUpdate);
      document.removeEventListener('visibilitychange', checkForUpdate);
      window.clearInterval(timer);
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div role="status" className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-zinc-600 bg-zinc-900 p-4 text-sm text-zinc-100 shadow-xl">
      <p>A new version of World Builder is available.</p>
      <p className="mt-1 text-zinc-400">Save your changes, then reload to use the latest version.</p>
      <button
        type="button"
        className="mt-3 rounded bg-zinc-100 px-3 py-1.5 font-medium text-zinc-900"
        onClick={() => void updateServiceWorker(true)}
      >
        Reload and update
      </button>
    </div>
  );
}

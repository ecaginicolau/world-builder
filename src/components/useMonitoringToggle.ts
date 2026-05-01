import { useEffect, useRef } from 'react';
import { useUiStore } from '@/lib/uiStore';
import { useUpdateUserSettings, useUserSettings } from '@/lib/queries/userSettings';

/**
 * Source of truth for the monitoring panel toggle.
 *
 * - Local store (Zustand) is the authoritative state for current rendering.
 * - On first arrival of `useUserSettings`, we hydrate the local store ONCE
 *   from the server preference. After that, local wins — toggling immediately
 *   updates local + fires a write to the server, but a re-render with stale
 *   server data must NOT pull us back.
 * - Both the header toggle button and the panel × button must use this hook
 *   so they stay in sync (and both persist).
 */
export function useMonitoringToggle() {
  const open = useUiStore((s) => s.monitoringOpen);
  const setLocal = useUiStore((s) => s.setMonitoringOpen);
  const settingsQ = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    if (!settingsQ.data) return;
    if (settingsQ.data.monitoringOpen !== undefined) {
      setLocal(settingsQ.data.monitoringOpen);
    }
    hydratedRef.current = true;
  }, [settingsQ.data, setLocal]);

  function setOpen(next: boolean) {
    setLocal(next);
    updateSettings.mutate({ patch: { monitoringOpen: next } });
  }

  function toggle() {
    setOpen(!open);
  }

  return { open, setOpen, toggle };
}

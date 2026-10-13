import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateNotice } from './AppUpdateNotice';

const worker = vi.hoisted(() => ({
  waiting: false,
  update: vi.fn().mockResolvedValue(undefined),
  activate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: { onRegisteredSW: (url: string, registration: unknown) => void }) => {
    options.onRegisteredSW('/sw.js', { update: worker.update });
    return { needRefresh: [worker.waiting], updateServiceWorker: worker.activate };
  },
}));

describe('AppUpdateNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    worker.waiting = false;
  });

  it('keeps the writing session open until the user accepts an available update', () => {
    worker.waiting = true;
    render(<AppUpdateNotice />);
    expect(screen.getByRole('status')).toHaveTextContent('Save your changes');
    expect(worker.activate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload and update' }));
    expect(worker.activate).toHaveBeenCalledWith(true);
  });

  it('checks for deployments when returning to the tab and removes its listener on unmount', () => {
    const view = render(<AppUpdateNotice />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.focus(window);
    expect(worker.update).toHaveBeenCalledTimes(1);
    view.unmount();
    fireEvent.focus(window);
    expect(worker.update).toHaveBeenCalledTimes(1);
  });
});

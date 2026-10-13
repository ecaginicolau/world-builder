import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BooksScreen } from './BooksScreen';

const state = vi.hoisted(() => ({ mutate: vi.fn(), pending: false }));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ worldId: 'world' }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('@/lib/queries/worlds', () => ({ useWorld: () => ({ data: { name: 'World' } }) }));
vi.mock('@/features/auth/session', () => ({ useSession: () => ({ status: 'anonymous' }) }));
vi.mock('@/lib/useConfirm', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/lib/queries/books', () => ({
  useBooks: () => ({ data: [
    { id: 'a', title: 'First', rank: 'A', series_title: 'Series', volume_number: 3 },
    { id: 'b', title: 'Second', rank: 'B', volume_number: null },
    { id: 'c', title: 'Third', rank: 'C', volume_number: 1 },
  ] }),
  useCreateBook: () => ({}),
  useDeleteBook: () => ({}),
  useUpdateBook: () => ({ mutate: state.mutate, isPending: state.pending }),
}));

afterEach(() => { cleanup(); state.mutate.mockClear(); state.pending = false; });
describe('book list ordering', () => {
  it('shows volume numbers independently of list position and disables boundary moves', () => {
    render(<BooksScreen />);
    expect(screen.getByText('Series · Tome 3 · Position 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Third down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Second up' }));
    const patch = state.mutate.mock.calls[0][0];
    expect(patch.id).toBe('b');
    expect(patch.rank < 'A').toBe(true);
    expect(patch).not.toHaveProperty('volumeNumber');
  });
  it('moves a book between its next two siblings', () => {
    render(<BooksScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Move First down' }));
    const patch = state.mutate.mock.calls[0][0];
    expect(patch.id).toBe('a');
    expect(patch.rank > 'B' && patch.rank < 'C').toBe(true);
  });
  it('prevents another move while the previous save and refresh are pending', () => {
    state.pending = true;
    render(<BooksScreen />);
    expect(screen.getByRole('button', { name: 'Move Second up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Second down' })).toBeDisabled();
  });
});

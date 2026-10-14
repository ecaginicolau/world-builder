import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useBooks, useUpdateBook } from './books';
import { rankForMoveUp } from '@/features/timeline/timelineItems';

const db = vi.hoisted(() => ({ rows: [
  { id: 'one', world_id: 'world', rank: '01', volume_number: null },
  { id: 'three', world_id: 'world', rank: 'f', volume_number: null },
  { id: 'two', world_id: 'world', rank: 'K', volume_number: null },
] }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => {
  let id: string;
  let patch: Record<string, unknown>;
  const query = {
    select: () => query,
    eq: (key: string, value: string) => { if (key === 'id') id = value; return query; },
    // Simulate the database returning lowercase f before uppercase K.
    order: async () => ({ data: db.rows.map((row) => ({ ...row })), error: null }),
    update: (value: Record<string, unknown>) => { patch = value; return query; },
    single: async () => {
      const row = db.rows.find((item) => item.id === id)!;
      Object.assign(row, patch);
      return { data: { ...row }, error: null };
    },
  };
  return query;
} } }));

afterEach(cleanup);

it('uses ASCII ranks on load, after moving, and after reloading from the database', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => ({ books: useBooks('world'), update: useUpdateBook() }), { wrapper });
  await waitFor(() => expect(result.current.books.isSuccess).toBe(true));
  expect(result.current.books.data?.map((b) => b.id)).toEqual(['one', 'two', 'three']);
  const rank = rankForMoveUp(result.current.books.data!.map((b) => b.rank), 2)!;
  await act(async () => { await result.current.update.mutateAsync({ id: 'three', rank }); });
  await waitFor(() => expect(result.current.books.data?.map((b) => b.id)).toEqual(['one', 'three', 'two']));
  await act(async () => { await result.current.books.refetch(); });
  expect(result.current.books.data?.map((b) => b.id)).toEqual(['one', 'three', 'two']);
  expect(db.rows.every((b) => b.volume_number === null)).toBe(true);
  client.clear();
});

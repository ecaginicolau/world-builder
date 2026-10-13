-- Book list order continues to use rank; volume numbering is independent.
alter table public.books
  add column if not exists volume_number integer
  check (volume_number > 0);

comment on column public.books.volume_number is
  'Optional positive volume number within a series. Does not change list order.';

-- V024 — Image filters per book edition
--
-- Per-edition brightness/contrast/grayscale settings, applied to illustrations
-- at PDF render time (non-destructive — the stored asset bytes are untouched).
-- Lets a user keep ONE set of high-res color illustrations and produce
-- multiple printed editions with different tone treatments:
--   - 5×8 paperback : grayscale + lifted brightness for cheap monochrome print
--   - 6×9 paperback : color + mild brightness/contrast bump
--
-- Why columns instead of a JSON blob: the field set is small, stable, and
-- benefits from checks. Same reasoning as the rest of V019.
--
-- Defaults are no-op (100/100/false) — existing editions keep their current
-- look until the user touches the controls.
--
-- Idempotent: safe to re-apply.

alter table public.book_editions
  add column if not exists image_brightness numeric(5,2) not null default 100,
  add column if not exists image_contrast   numeric(5,2) not null default 100,
  add column if not exists image_grayscale  boolean      not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'book_editions_image_brightness_range'
  ) then
    alter table public.book_editions
      add constraint book_editions_image_brightness_range
      check (image_brightness between 50 and 200);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'book_editions_image_contrast_range'
  ) then
    alter table public.book_editions
      add constraint book_editions_image_contrast_range
      check (image_contrast between 50 and 200);
  end if;
end$$;

comment on column public.book_editions.image_brightness is
  'Brightness multiplier applied to illustrations at PDF render (percent, 50–200, 100 = no change). Stored asset is untouched.';
comment on column public.book_editions.image_contrast is
  'Contrast multiplier applied to illustrations at PDF render (percent, 50–200, 100 = no change). Stored asset is untouched.';
comment on column public.book_editions.image_grayscale is
  'When true, illustrations are converted to grayscale at PDF render. Stored asset is untouched.';

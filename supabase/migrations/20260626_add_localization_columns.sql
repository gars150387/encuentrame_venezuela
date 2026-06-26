alter table public.reports add column if not exists localized_by_name text;
alter table public.reports add column if not exists localized_by_phone text;
alter table public.reports add column if not exists localized_note text;
alter table public.reports add column if not exists localized_at timestamptz;
alter table public.reports add column if not exists localized_reported_by text;
